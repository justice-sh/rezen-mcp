import { and, asc, count, eq, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ClassSummary, Repository } from "../data/repository.js";
import type { School, SchoolClass, ScoreEntry, Student } from "../data/types.js";
import type { Database } from "./database.js";
import { DatabaseError } from "./errors.js";
import { inSchool, type Executor } from "./row-security.js";
import * as schema from "./schema.js";

const { schools, classes, students, subjects, terms, scores } = schema;

/**
 * Orders text by its bytes, whatever collation the database was created with, so
 * the order is the same on every server (ADR-019).
 */
const bytewise = (column: SQLWrapper) => sql`${column} collate "C"`;

export interface PostgresRepositoryOptions {
  /**
   * Run every query as the restricted role, for this school only (ADR-024). Postgres
   * then shows the repository nothing else, whatever the code asks for. Without it,
   * queries run as the connected user, which sees every school: for seeding, the
   * startup checks and tests only.
   */
  readonly restrictedToSchool?: string;
}

/**
 * The `Repository` over Postgres (ADR-019), and its only implementation (ADR-023).
 * The contract tests in `tests/support/repository-contract.ts` work out the
 * expected answers from the dataset itself and run against this class.
 *
 * It does not own the `Database`: whoever created it closes it.
 */
export class PostgresRepository implements Repository {
  private readonly db: PostgresJsDatabase;
  private readonly restrictedToSchool: string | undefined;

  constructor(database: Database, options: PostgresRepositoryOptions = {}) {
    if (options.restrictedToSchool === "") {
      throw new Error("A restricted repository needs a school ID.");
    }
    this.db = drizzle(database.sql);
    this.restrictedToSchool = options.restrictedToSchool;
  }

  /** Runs a query as the connected user, or inside the school's row-level security. */
  private run<T>(query: (db: Executor) => Promise<T>): Promise<T> {
    return this.restrictedToSchool === undefined
      ? query(this.db)
      : inSchool(this.db, this.restrictedToSchool, query);
  }

  getSchool(schoolId: string): Promise<School | undefined> {
    return this.run(async (db) => {
      const [row] = await db
        .select({ id: schools.id, name: schools.name })
        .from(schools)
        .where(eq(schools.id, schoolId));
      return row;
    });
  }

  listClasses(schoolId: string): Promise<ClassSummary[]> {
    return this.run((db) =>
      db
        .select({
          id: classes.id,
          name: classes.name,
          level: classes.level,
          studentCount: count(students.id),
        })
        .from(classes)
        .leftJoin(students, eq(students.classId, classes.id))
        .where(eq(classes.schoolId, schoolId))
        .groupBy(classes.id, classes.name, classes.level)
        .orderBy(asc(classes.level), bytewise(classes.id)),
    );
  }

  getClass(classId: string): Promise<SchoolClass | undefined> {
    return this.run(async (db) => {
      const [row] = await db
        .select({
          id: classes.id,
          schoolId: classes.schoolId,
          name: classes.name,
          level: classes.level,
        })
        .from(classes)
        .where(eq(classes.id, classId));
      return row;
    });
  }

  getStudent(studentId: string): Promise<Student | undefined> {
    return this.run(async (db) => {
      const [row] = await db
        .select({ id: students.id, classId: students.classId, name: students.name })
        .from(students)
        .where(eq(students.id, studentId));
      return row;
    });
  }

  listStudents(classId: string): Promise<Student[]> {
    return this.run((db) =>
      db
        .select({ id: students.id, classId: students.classId, name: students.name })
        .from(students)
        .where(eq(students.classId, classId))
        .orderBy(bytewise(students.name), bytewise(students.id)),
    );
  }

  listScores(classId: string, term: string): Promise<ScoreEntry[]> {
    return this.run((db) =>
      db
        .select({
          studentId: scores.studentId,
          subject: scores.subject,
          term: scores.term,
          ca: scores.ca,
          exam: scores.exam,
        })
        .from(scores)
        .innerJoin(students, eq(students.id, scores.studentId))
        .where(and(eq(students.classId, classId), eq(scores.term, term)))
        .orderBy(bytewise(scores.studentId), bytewise(scores.subject)),
    );
  }

  listSubjects(): Promise<string[]> {
    return this.run(async (db) => {
      const rows = await db
        .select({ name: subjects.name })
        .from(subjects)
        .orderBy(asc(subjects.position));
      return rows.map((row) => row.name);
    });
  }

  listTerms(): Promise<string[]> {
    return this.run(async (db) => {
      const rows = await db.select({ id: terms.id }).from(terms).orderBy(asc(terms.position));
      return rows.map((row) => row.id);
    });
  }

  async getCurrentTerm(): Promise<string> {
    const [row] = await this.run((db) =>
      db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true)),
    );
    if (row === undefined) {
      // The database allows at most one current term, not at least one (ADR-016).
      throw new DatabaseError(
        "no-current-term",
        "No term is marked as current. Run \"pnpm db:seed\" (it marks the dataset's term as current when none is), or set one term's is_current to true.",
      );
    }
    return row.id;
  }
}
