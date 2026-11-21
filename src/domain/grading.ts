import type { ScoreEntry, Student } from "../data/types.js";

/**
 * Grading rules (see docs/FEATURE_SPEC.md, section 5). Pure functions only:
 * no I/O, so every rule is easy to test.
 */

export type Grade = "A" | "B" | "C" | "D" | "E" | "F";
export type MissingComponent = "ca" | "exam" | "both";

/** Highest band first. A subject total (CA + exam, 0 to 100) maps to the first band it reaches. */
export const GRADE_BANDS: readonly { min: number; grade: Grade }[] = [
  { min: 70, grade: "A" },
  { min: 60, grade: "B" },
  { min: 50, grade: "C" },
  { min: 45, grade: "D" },
  { min: 40, grade: "E" },
  { min: 0, grade: "F" },
];

export function gradeFor(subjectTotal: number): Grade {
  for (const band of GRADE_BANDS) {
    if (subjectTotal >= band.min) return band.grade;
  }
  return "F";
}

export interface SubjectResult {
  subject: string;
  ca: number | null;
  exam: number | null;
  /** CA + exam, or null if either part is missing. */
  total: number | null;
  grade: Grade | null;
  /** Which part is missing, or null if the entry is complete. */
  missing: MissingComponent | null;
}

/** A missing entry (undefined) and a missing component are both reported, never treated as zero. */
export function computeSubjectResult(
  subject: string,
  entry: ScoreEntry | undefined,
): SubjectResult {
  const ca = entry?.ca ?? null;
  const exam = entry?.exam ?? null;

  let missing: MissingComponent | null = null;
  if (ca === null && exam === null) missing = "both";
  else if (ca === null) missing = "ca";
  else if (exam === null) missing = "exam";

  if (ca === null || exam === null) {
    return { subject, ca, exam, total: null, grade: null, missing };
  }
  const total = ca + exam;
  return { subject, ca, exam, total, grade: gradeFor(total), missing: null };
}

export interface StudentResult {
  studentId: string;
  name: string;
  /** One row per subject, in the order given. */
  subjects: SubjectResult[];
  /** Sum of subject totals, or null if any subject is incomplete. */
  total: number | null;
  /** Total divided by the number of subjects (2 decimals), or null if total is null. */
  average: number | null;
  missingSubjects: string[];
}

export function computeStudentResult(
  student: Student,
  subjects: readonly string[],
  scores: readonly ScoreEntry[],
): StudentResult {
  const own = scores.filter((s) => s.studentId === student.id);
  const rows = subjects.map((subject) =>
    computeSubjectResult(
      subject,
      own.find((e) => e.subject === subject),
    ),
  );

  const missingSubjects = rows.filter((r) => r.missing !== null).map((r) => r.subject);
  const complete = missingSubjects.length === 0 && rows.length > 0;
  const total = complete ? rows.reduce((sum, r) => sum + (r.total ?? 0), 0) : null;
  const average = total === null ? null : Math.round((total / rows.length) * 100) / 100;

  return {
    studentId: student.id,
    name: student.name,
    subjects: rows,
    total,
    average,
    missingSubjects,
  };
}

export interface RankedStudent {
  position: number;
  studentId: string;
  name: string;
  total: number;
}

export interface UnrankedStudent {
  studentId: string;
  name: string;
  missingSubjects: string[];
}

/**
 * Standard competition ranking: ties share a position and the next position
 * is skipped (1, 2, 2, 4). Students with any missing score are unranked.
 * Ties are listed by name, then ID, so the output is deterministic.
 */
export function rankStudents(results: readonly StudentResult[]): {
  ranked: RankedStudent[];
  unranked: UnrankedStudent[];
} {
  const complete = results.filter((r): r is StudentResult & { total: number } => r.total !== null);
  complete.sort(
    (a, b) =>
      b.total - a.total || a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId),
  );

  const ranked: RankedStudent[] = [];
  complete.forEach((r, index) => {
    const previous = ranked[index - 1];
    const position = previous && previous.total === r.total ? previous.position : index + 1;
    ranked.push({ position, studentId: r.studentId, name: r.name, total: r.total });
  });

  const unranked = results
    .filter((r) => r.total === null)
    .map((r) => ({ studentId: r.studentId, name: r.name, missingSubjects: r.missingSubjects }));

  return { ranked, unranked };
}

/** Human-readable rules, generated from the constants above so docs and code cannot drift. */
export function gradingRulesText(): string {
  const bands = GRADE_BANDS.map((b, i) => {
    const upper = i === 0 ? 100 : (GRADE_BANDS[i - 1]?.min ?? 100) - 1;
    return `- ${b.grade}: ${b.min} to ${upper}`;
  }).join("\n");

  return [
    "# Grading rules",
    "",
    "- Each subject has a continuous assessment (CA, 0 to 40) and an exam (0 to 60).",
    "- Subject total = CA + exam (0 to 100). Student total = sum of subject totals.",
    "- Average = student total divided by the number of subjects.",
    "- Missing scores are never treated as zero. A missing part is reported as null.",
    "- A student with any missing score has no total, average or position (unranked).",
    "",
    "## Grade bands (by subject total)",
    bands,
    "",
    "## Ranking",
    "- Students are ranked by total, highest first.",
    "- Ties share a position and the next position is skipped (1, 2, 2, 4).",
  ].join("\n");
}
