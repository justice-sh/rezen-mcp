/** Domain types. All data in this project is synthetic. */

export interface School {
  id: string;
  name: string;
}

export interface SchoolClass {
  id: string;
  schoolId: string;
  /** Display name, e.g. "Primary 4". */
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
  /** Continuous assessment score (0-40), or null if not yet entered. */
  ca: number | null;
  /** Exam score (0-60), or null if not yet entered. */
  exam: number | null;
}

export interface Dataset {
  schools: School[];
  classes: SchoolClass[];
  students: Student[];
  scores: ScoreEntry[];
  /** All subjects taught, in display order. */
  subjects: string[];
  /** All terms with data, in chronological order. */
  terms: string[];
  /** The term in progress right now. Must be one of `terms`. Used when a caller omits the term. */
  currentTerm: string;
}
