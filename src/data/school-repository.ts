import type { ClassSummary, Repository } from "./repository.js";
import type { School, SchoolClass, ScoreEntry, Student } from "./types.js";

/**
 * One school's view of the data (ADR-021).
 *
 * It has the same reads as `Repository`, but nothing takes a school ID: the
 * school is fixed when the view is made, so code that holds one cannot ask for
 * another school's data. Another school's class or student looks exactly like
 * an unknown ID: `undefined` for a single item, `[]` for a list. So existence is
 * never leaked across schools (spec section 8).
 */
export interface SchoolRepository {
  /** The school this view belongs to. */
  readonly schoolId: string;
  /** The school itself; `undefined` only if no such school exists in the data. */
  getSchool(): Promise<School | undefined>;
  /** The school's classes, by level, then by class ID. */
  listClasses(): Promise<ClassSummary[]>;
  /** A class of this school; `undefined` for an unknown class and for another school's class. */
  getClass(classId: string): Promise<SchoolClass | undefined>;
  /** A student of this school; `undefined` for an unknown student and for another school's student. */
  getStudent(studentId: string): Promise<Student | undefined>;
  /** The class's students, by name, then by student ID; `[]` unless the class is this school's. */
  listStudents(classId: string): Promise<Student[]>;
  /** The class's score entries in one term; `[]` unless the class is this school's. */
  listScores(classId: string, term: string): Promise<ScoreEntry[]>;
  /** Subjects in display order. Shared by every school. */
  listSubjects(): Promise<string[]>;
  /** Terms in chronological order. Shared by every school. */
  listTerms(): Promise<string[]>;
  /** The term in progress right now. Shared by every school. */
  getCurrentTerm(): Promise<string>;
}

/**
 * Makes a school's view over any `Repository`, so it works the same for the
 * in-memory and the Postgres store. It does not check that the school exists:
 * for an unknown school every school-owned read comes back empty.
 */
export function scopeToSchool(repo: Repository, schoolId: string): SchoolRepository {
  return new ScopedRepository(repo, schoolId);
}

class ScopedRepository implements SchoolRepository {
  // A real private field, so the unscoped repository cannot be reached through
  // the view, not even by code that ignores the types.
  readonly #repo: Repository;
  readonly schoolId: string;

  constructor(repo: Repository, schoolId: string) {
    if (schoolId === "") throw new Error("A school-scoped repository needs a school ID.");
    this.#repo = repo;
    this.schoolId = schoolId;
  }

  getSchool(): Promise<School | undefined> {
    return this.#repo.getSchool(this.schoolId);
  }

  listClasses(): Promise<ClassSummary[]> {
    return this.#repo.listClasses(this.schoolId);
  }

  async getClass(classId: string): Promise<SchoolClass | undefined> {
    const cls = await this.#repo.getClass(classId);
    return cls?.schoolId === this.schoolId ? cls : undefined;
  }

  async getStudent(studentId: string): Promise<Student | undefined> {
    const student = await this.#repo.getStudent(studentId);
    if (student === undefined) return undefined;
    // A student belongs to a school through their class.
    return (await this.getClass(student.classId)) === undefined ? undefined : student;
  }

  // Both class reads below check the class first, so another school's rows are
  // never even read.

  async listStudents(classId: string): Promise<Student[]> {
    return (await this.getClass(classId)) === undefined ? [] : this.#repo.listStudents(classId);
  }

  async listScores(classId: string, term: string): Promise<ScoreEntry[]> {
    return (await this.getClass(classId)) === undefined ? [] : this.#repo.listScores(classId, term);
  }

  listSubjects(): Promise<string[]> {
    return this.#repo.listSubjects();
  }

  listTerms(): Promise<string[]> {
    return this.#repo.listTerms();
  }

  getCurrentTerm(): Promise<string> {
    return this.#repo.getCurrentTerm();
  }
}
