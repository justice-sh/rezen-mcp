import { z } from "zod";
import type { Repository } from "../data/repository.js";
import { rankStudents } from "../domain/grading.js";
import { loadClassResults } from "./class-data.js";
import { classIdInput, classRefSchema, termInput } from "./schemas.js";

export const RANK_CLASS_DESCRIPTION =
  "Rank a class by total score for a term. Ties share a position (1, 2, 2, 4). " +
  "Students with any missing score are listed separately as unranked, with the missing subjects.";

export const rankClassInput = { classId: classIdInput, term: termInput };

export const rankClassOutput = {
  class: classRefSchema,
  term: z.string(),
  ranked: z.array(
    z.object({
      position: z.number(),
      studentId: z.string(),
      name: z.string(),
      total: z.number(),
    }),
  ),
  unranked: z.array(
    z.object({
      studentId: z.string(),
      name: z.string(),
      missingSubjects: z.array(z.string()),
    }),
  ),
};

export async function rankClass(
  repo: Repository,
  args: { classId: string; term?: string | undefined },
) {
  const loaded = await loadClassResults(repo, args.classId, args.term);
  if (!loaded.ok) return loaded.error;

  const { ranked, unranked } = rankStudents(loaded.results);
  const structured = {
    class: { id: loaded.cls.id, name: loaded.cls.name },
    term: loaded.term,
    ranked,
    unranked,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
