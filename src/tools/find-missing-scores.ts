import { z } from "zod";
import type { SchoolRepository } from "../data/school-repository.js";
import { loadClassResults } from "./class-data.js";
import { classIdInput, classRefSchema, termInput } from "./schemas.js";

export const FIND_MISSING_SCORES_DESCRIPTION =
  "List missing score entries for a class in a term, so gaps can be fixed before report cards are issued. " +
  "The component says whether the CA, the exam or both are missing.";

export const findMissingScoresInput = { classId: classIdInput, term: termInput };

export const findMissingScoresOutput = {
  class: classRefSchema,
  term: z.string(),
  missing: z.array(
    z.object({
      studentId: z.string(),
      name: z.string(),
      subject: z.string(),
      component: z.enum(["ca", "exam", "both"]),
    }),
  ),
};

export async function findMissingScores(
  repo: SchoolRepository,
  args: { classId: string; term?: string | undefined },
) {
  const loaded = await loadClassResults(repo, args.classId, args.term);
  if (!loaded.ok) return loaded.error;

  const missing = loaded.results.flatMap((r) =>
    r.subjects.flatMap((s) =>
      s.missing === null
        ? []
        : [{ studentId: r.studentId, name: r.name, subject: s.subject, component: s.missing }],
    ),
  );
  const structured = {
    class: { id: loaded.cls.id, name: loaded.cls.name },
    term: loaded.term,
    missing,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
