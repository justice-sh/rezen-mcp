import { z } from "zod";
import type { Repository } from "../data/repository.js";

export const listClassesInput = {
  schoolId: z
    .string()
    .min(1)
    .describe(
      "The school's ID, e.g. 'sch_demo_a'. Phase 2 replaces this with token-scoped access.",
    ),
};

export const listClassesOutput = {
  school: z.string(),
  classes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      level: z.number(),
      studentCount: z.number(),
    }),
  ),
};

export const LIST_CLASSES_DESCRIPTION =
  "List the classes in a school, with grade level and number of students. " +
  "Use this first to discover class IDs before asking for results or reports.";

export async function listClasses(repo: Repository, args: { schoolId: string }) {
  const school = await repo.getSchool(args.schoolId);
  if (!school) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `Unknown school ID '${args.schoolId}'. Check the ID and try again.`,
        },
      ],
    };
  }

  const classes = await repo.listClasses(school.id);
  const structured = { school: school.name, classes };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
