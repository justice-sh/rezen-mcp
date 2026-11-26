import { z } from "zod";
import type { SchoolRepository } from "../data/school-repository.js";
import { loadClassResults } from "./class-data.js";
import { classIdInput, classRefSchema, subjectResultSchema, termInput } from "./schemas.js";

export const GET_CLASS_RESULTS_DESCRIPTION =
  "Get every student's scores for a class in a term: CA, exam, subject total and grade per subject, " +
  "plus each student's total and average. Missing scores are null, never zero. " +
  "Use for full results tables; use rank_class for positions.";

export const getClassResultsInput = { classId: classIdInput, term: termInput };

export const getClassResultsOutput = {
  class: classRefSchema,
  term: z.string(),
  subjects: z.array(z.string()),
  students: z.array(
    z.object({
      studentId: z.string(),
      name: z.string(),
      subjects: z.array(subjectResultSchema),
      total: z.number().nullable(),
      average: z.number().nullable(),
    }),
  ),
};

export async function getClassResults(
  repo: SchoolRepository,
  args: { classId: string; term?: string | undefined },
) {
  const loaded = await loadClassResults(repo, args.classId, args.term);
  if (!loaded.ok) return loaded.error;

  const structured = {
    class: { id: loaded.cls.id, name: loaded.cls.name },
    term: loaded.term,
    subjects: loaded.subjects,
    students: loaded.results.map((r) => ({
      studentId: r.studentId,
      name: r.name,
      subjects: r.subjects,
      total: r.total,
      average: r.average,
    })),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
