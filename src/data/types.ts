/** Domain types. All data in this project is synthetic. */

export interface School {
  id: string;
  name: string;
}

export interface SchoolClass {
  id: string;
  schoolId: string;
  /** Display name, e.g. "Primary 4 A". */
  name: string;
  /** Grade level as a number, e.g. 4 for Primary 4. */
  level: number;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
}

export interface ScoreEntry {
  studentId: string;
  subject: string;
  /** Term identifier, e.g. "2026-T1". */
  term: string;
  /** Continuous assessment score (0-40). */
  ca: number;
  /** Exam score (0-60). */
  exam: number;
}

export interface Dataset {
  schools: School[];
  classes: SchoolClass[];
  students: Student[];
  scores: ScoreEntry[];
}
