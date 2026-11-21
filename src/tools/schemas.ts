import { z } from "zod";

export const termInput = z
  .string()
  .min(1)
  .optional()
  .describe("Term ID such as '2026-T1'. Defaults to the current term.");

export const classIdInput = z
  .string()
  .min(1)
  .describe("Class ID from list_classes, e.g. 'sch_demo_a_c3'.");

export const classRefSchema = z.object({ id: z.string(), name: z.string() });

export const subjectResultSchema = z.object({
  subject: z.string(),
  ca: z.number().nullable(),
  exam: z.number().nullable(),
  total: z.number().nullable(),
  grade: z.enum(["A", "B", "C", "D", "E", "F"]).nullable(),
  missing: z.enum(["ca", "exam", "both"]).nullable(),
});
