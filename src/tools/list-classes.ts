import { z } from "zod";
import type { SchoolRepository } from "../data/school-repository.js";
import { errorResult } from "./errors.js";

// No input: the school comes from the caller's token, never from an argument (ADR-022).

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
  "List the classes in your school, with grade level and number of students. " +
  "Takes no input: the school is the one your access token belongs to. " +
  "Use this first to discover class IDs before asking for results or reports.";

export async function listClasses(school: SchoolRepository) {
  const found = await school.getSchool();
  // A verified token always names a real school (ADR-020), so this is a safety net.
  if (!found) return errorResult("No school data is available for this access.");

  const classes = await school.listClasses();
  const structured = { school: found.name, classes };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
