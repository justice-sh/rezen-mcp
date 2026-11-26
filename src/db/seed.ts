import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { generateDataset } from "../data/synthetic.js";
import type { Dataset } from "../data/types.js";
import type { Database } from "./database.js";
import { DatabaseError, findSqlError, notMigrated } from "./errors.js";
import * as schema from "./schema.js";

/** How many rows one insert statement carries. Far below Postgres' limit on parameters. */
const CHUNK_SIZE = 500;

export interface SeedTableCounts {
  /** Rows that were not there and are now. */
  readonly inserted: number;
  /** Rows that were already there, and were left exactly as they were. */
  readonly skipped: number;
}

export interface SeedResult {
  readonly schools: SeedTableCounts;
  readonly classes: SeedTableCounts;
  readonly students: SeedTableCounts;
  readonly subjects: SeedTableCounts;
  readonly terms: SeedTableCounts;
  readonly scores: SeedTableCounts;
  /** True if this run marked the dataset's current term as current (no term was current yet). */
  readonly currentTermSet: boolean;
}

/**
 * Inserts the synthetic dataset into an already migrated database.
 *
 * It is safe to run on every deploy (ADR-018): rows are inserted or ignored, so
 * a second run changes nothing, rows that exist are never overwritten, and
 * nothing is ever deleted or truncated. The whole run is one transaction, so it
 * either completes or leaves the database as it found it.
 */
export async function seedDatabase(
  database: Database,
  dataset: Dataset = generateDataset(),
): Promise<SeedResult> {
  const rows = toRows(dataset);
  await database.check();
  try {
    return await drizzle(database.sql).transaction(async (tx) => {
      const insert = <Row>(
        write: (chunk: Row[]) => PromiseLike<readonly unknown[]>,
        all: readonly Row[],
      ) => insertInChunks(all, write);

      // Parents before children, so every foreign key is satisfied.
      const schools = await insert(
        (chunk) => tx.insert(schema.schools).values(chunk).onConflictDoNothing().returning(),
        rows.schools,
      );
      const subjects = await insert(
        (chunk) => tx.insert(schema.subjects).values(chunk).onConflictDoNothing().returning(),
        rows.subjects,
      );
      const terms = await insert(
        (chunk) => tx.insert(schema.terms).values(chunk).onConflictDoNothing().returning(),
        rows.terms,
      );
      const classes = await insert(
        (chunk) => tx.insert(schema.classes).values(chunk).onConflictDoNothing().returning(),
        rows.classes,
      );
      const students = await insert(
        (chunk) => tx.insert(schema.students).values(chunk).onConflictDoNothing().returning(),
        rows.students,
      );
      const scores = await insert(
        (chunk) => tx.insert(schema.scores).values(chunk).onConflictDoNothing().returning(),
        rows.scores,
      );

      // Terms went in as not current (two current terms are impossible). Mark the
      // dataset's term as current only if no term is, so a re-run never moves a
      // current term that someone has advanced.
      const marked = await tx.execute(sql`
        update terms set is_current = true
        where id = ${dataset.currentTerm}
          and not exists (select 1 from terms where is_current)
        returning id`);

      return {
        schools,
        classes,
        students,
        subjects,
        terms,
        scores,
        currentTermSet: marked.length > 0,
      };
    });
  } catch (error) {
    const sqlError = findSqlError(error);
    if (sqlError?.code === "42P01") throw notMigrated(error);
    if (sqlError !== undefined) {
      // Drizzle's own message repeats the query and its parameters (the row values).
      // The database's message names the problem without them.
      throw new DatabaseError(
        "rejected",
        `Seeding failed: ${sqlError.message} (SQLSTATE ${sqlError.code}). Nothing was changed.`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Maps the domain dataset to table rows, filling in `school_id` down the chain. */
function toRows(dataset: Dataset) {
  const schoolOfClass = new Map(dataset.classes.map((c) => [c.id, c.schoolId]));
  const schoolOfStudent = new Map<string, string>();
  const students = dataset.students.map((student) => {
    const schoolId = schoolOfClass.get(student.classId);
    if (schoolId === undefined) {
      throw new Error(`Student ${student.id} is in unknown class ${student.classId}.`);
    }
    schoolOfStudent.set(student.id, schoolId);
    return { id: student.id, classId: student.classId, schoolId, name: student.name };
  });
  const scores = dataset.scores.map((score) => {
    const schoolId = schoolOfStudent.get(score.studentId);
    if (schoolId === undefined) {
      throw new Error(`A score refers to unknown student ${score.studentId}.`);
    }
    return { ...score, schoolId };
  });
  if (!dataset.terms.includes(dataset.currentTerm)) {
    throw new Error(`The current term ${dataset.currentTerm} is not one of the terms.`);
  }
  return {
    schools: dataset.schools.map((s) => ({ id: s.id, name: s.name })),
    subjects: dataset.subjects.map((name, index) => ({ name, position: index + 1 })),
    terms: dataset.terms.map((id, index) => ({ id, position: index + 1, isCurrent: false })),
    classes: dataset.classes.map((c) => ({
      id: c.id,
      schoolId: c.schoolId,
      name: c.name,
      level: c.level,
    })),
    students,
    scores,
  };
}

async function insertInChunks<Row>(
  rows: readonly Row[],
  write: (chunk: Row[]) => PromiseLike<readonly unknown[]>,
): Promise<SeedTableCounts> {
  let inserted = 0;
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    inserted += (await write(rows.slice(start, start + CHUNK_SIZE))).length;
  }
  return { inserted, skipped: rows.length - inserted };
}
