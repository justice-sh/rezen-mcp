import { and, asc, count, eq, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { ClassSummary, Repository } from "../data/repository.js";
import type { School, SchoolClass, ScoreEntry, Student } from "../data/types.js";
import type { Database } from "./database.js";
import { DatabaseError } from "./errors.js";
import * as schema from "./schema.js";

const { schools, classes, students, subjects, terms, scores } = schema;

/**
 * Orders text by its bytes, whatever collation the database was created with, so
 * the order is the same on every server (ADR-019).
 */
const bytewise = (column: SQLWrapper) => sql`${column} collate "C"`;

/**
 * The `Repository` over Postgres (ADR-019), and its only implementation (ADR-023).
 * The contract tests in `tests/support/repository-contract.ts` work out the
 * expected answers from the dataset itself and run against this class.
 *
 * It does not own the `Database`: whoever created it closes it.
 */
export class PostgresRepository implements Repository {
  private readonly db;

  constructor(database: Database) {
    this.db = drizzle(database.sql);
  }

  async getSchool(schoolId: string): Promise<School | undefined> {
    const [row] = await this.db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.id, schoolId));
    return row;
  }

  async listClasses(schoolId: string): Promise<ClassSummary[]> {
    return this.db
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
      .orderBy(asc(classes.level), bytewise(classes.id));
  }

  async getClass(classId: string): Promise<SchoolClass | undefined> {
    const [row] = await this.db
      .select({
        id: classes.id,
        schoolId: classes.schoolId,
        name: classes.name,
        level: classes.level,
      })
      .from(classes)
      .where(eq(classes.id, classId));
    return row;
  }

  async getStudent(studentId: string): Promise<Student | undefined> {
    const [row] = await this.db
      .select({ id: students.id, classId: students.classId, name: students.name })
      .from(students)
      .where(eq(students.id, studentId));
    return row;
  }

  async listStudents(classId: string): Promise<Student[]> {
    return this.db
      .select({ id: students.id, classId: students.classId, name: students.name })
      .from(students)
      .where(eq(students.classId, classId))
      .orderBy(bytewise(students.name), bytewise(students.id));
  }

  async listScores(classId: string, term: string): Promise<ScoreEntry[]> {
    return this.db
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
      .orderBy(bytewise(scores.studentId), bytewise(scores.subject));
  }

  async listSubjects(): Promise<string[]> {
    const rows = await this.db
      .select({ name: subjects.name })
      .from(subjects)
      .orderBy(asc(subjects.position));
    return rows.map((row) => row.name);
  }

  async listTerms(): Promise<string[]> {
    const rows = await this.db.select({ id: terms.id }).from(terms).orderBy(asc(terms.position));
    return rows.map((row) => row.id);
  }

  async getCurrentTerm(): Promise<string> {
    const [row] = await this.db
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.isCurrent, true));
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
