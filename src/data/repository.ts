import { generateDataset } from "./synthetic.js";
import type { Dataset, School, SchoolClass, ScoreEntry, Student } from "./types.js";

export interface ClassSummary {
  id: string;
  name: string;
  level: number;
  studentCount: number;
}

/**
 * Data access boundary. Tools depend on this interface only, so the
 * in-memory implementation can be swapped for Postgres in Phase 2
 * (see docs/DECISIONS.md, ADR-004) without touching tool code.
 *
 * Every list has one defined order (ADR-019), so every implementation gives the
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

/** Compares text by its UTF-16 code units, which is how `collate "C"` orders ASCII text in Postgres. */
export function compareBytewise(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class InMemoryRepository implements Repository {
  constructor(private readonly data: Dataset) {}

  async getSchool(schoolId: string): Promise<School | undefined> {
    return this.data.schools.find((s) => s.id === schoolId);
  }

  async listClasses(schoolId: string): Promise<ClassSummary[]> {
    const classes: SchoolClass[] = this.data.classes
      .filter((c) => c.schoolId === schoolId)
      .sort((a, b) => a.level - b.level || compareBytewise(a.id, b.id));

    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      studentCount: this.data.students.filter((s) => s.classId === c.id).length,
    }));
  }

  async getClass(classId: string): Promise<SchoolClass | undefined> {
    return this.data.classes.find((c) => c.id === classId);
  }

  async getStudent(studentId: string): Promise<Student | undefined> {
    return this.data.students.find((s) => s.id === studentId);
  }

  async listStudents(classId: string): Promise<Student[]> {
    return this.data.students
      .filter((s) => s.classId === classId)
      .sort((a, b) => compareBytewise(a.name, b.name) || compareBytewise(a.id, b.id));
  }

  async listScores(classId: string, term: string): Promise<ScoreEntry[]> {
    const studentIds = new Set(
      this.data.students.filter((s) => s.classId === classId).map((s) => s.id),
    );
    return this.data.scores
      .filter((e) => e.term === term && studentIds.has(e.studentId))
      .sort(
        (a, b) =>
          compareBytewise(a.studentId, b.studentId) || compareBytewise(a.subject, b.subject),
      );
  }

  async listSubjects(): Promise<string[]> {
    return [...this.data.subjects];
  }

  async listTerms(): Promise<string[]> {
    return [...this.data.terms];
  }

  async getCurrentTerm(): Promise<string> {
    return this.data.currentTerm;
  }
}

export function createInMemoryRepository(seed?: number): InMemoryRepository {
  return new InMemoryRepository(generateDataset(seed === undefined ? {} : { seed }));
}
