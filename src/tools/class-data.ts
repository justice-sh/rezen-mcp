import type { SchoolRepository } from "../data/school-repository.js";
import type { SchoolClass } from "../data/types.js";
import { computeStudentResult, type StudentResult } from "../domain/grading.js";
import { notFound, type ToolError } from "./errors.js";
import { resolveTerm } from "./term.js";

export type ClassResults =
  | {
      ok: true;
      cls: SchoolClass;
      term: string;
      subjects: string[];
      results: StudentResult[];
    }
  | { ok: false; error: ToolError };

/** Shared by every class-based tool: validate the class and term, then compute each student's result. */
export async function loadClassResults(
  repo: SchoolRepository,
  classId: string,
  termArg: string | undefined,
): Promise<ClassResults> {
  const cls = await repo.getClass(classId);
  if (!cls) return { ok: false, error: notFound("class", classId) };

  const resolved = await resolveTerm(repo, termArg);
  if (!resolved.ok) return resolved;

  const [students, scores, subjects] = await Promise.all([
    repo.listStudents(cls.id),
    repo.listScores(cls.id, resolved.term),
    repo.listSubjects(),
  ]);
  const results = students.map((s) => computeStudentResult(s, subjects, scores));
  return { ok: true, cls, term: resolved.term, subjects, results };
}
