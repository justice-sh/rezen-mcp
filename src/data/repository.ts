import type { School, SchoolClass, ScoreEntry, Student } from "./types.js";

export interface ClassSummary {
  id: string;
  name: string;
  level: number;
  studentCount: number;
}

/**
 * Data access boundary (ADR-004). Tools read through it, and `PostgresRepository`
 * is its only implementation (ADR-023).
 *
 * Every list has one defined order (ADR-019), so the same data always gives the
 * same answers in the same order. Text is compared by its bytes (code units),
 * not by locale. An unknown ID gives `undefined` (single items) or `[]` (lists).
 */
export interface Repository {
  getSchool(schoolId: string): Promise<School | undefined>;
  /** The school's classes, by level, then by class ID. */
  listClasses(schoolId: string): Promise<ClassSummary[]>;
  getClass(classId: string): Promise<SchoolClass | undefined>;
  getStudent(studentId: string): Promise<Student | undefined>;
  /** The class's students, by name, then by student ID. */
  listStudents(classId: string): Promise<Student[]>;
  /** All score entries for the students of a class in one term, by student ID, then subject. */
  listScores(classId: string, term: string): Promise<ScoreEntry[]>;
  /** Subjects in display order. */
  listSubjects(): Promise<string[]>;
  /** Terms in chronological order. */
  listTerms(): Promise<string[]>;
  /** The term in progress right now (not merely the latest term that has data). */
  getCurrentTerm(): Promise<string>;
}

/**
 * Compares text by its UTF-16 code units, which is how `collate "C"` orders ASCII text in Postgres.
 * The repository contract tests use it to work out the expected order from the dataset itself.
 */
export function compareBytewise(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
