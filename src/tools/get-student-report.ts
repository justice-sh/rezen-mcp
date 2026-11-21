import { z } from "zod";
import type { Repository } from "../data/repository.js";
import { rankStudents } from "../domain/grading.js";
import { loadClassResults } from "./class-data.js";
import { notFound } from "./errors.js";
import { classRefSchema, subjectResultSchema, termInput } from "./schemas.js";

export const GET_STUDENT_REPORT_DESCRIPTION =
  "Get one student's report-card data for a term: subject scores and grades, total, average, " +
  "class position, and any missing subjects. Position is null if the student has missing scores. " +
  "Facts only; no comments are generated.";

export const getStudentReportInput = {
  studentId: z.string().min(1).describe("Student ID from get_class_results or rank_class."),
  term: termInput,
};

export const getStudentReportOutput = {
  student: z.object({ id: z.string(), name: z.string() }),
  class: classRefSchema,
  term: z.string(),
  subjects: z.array(subjectResultSchema),
  total: z.number().nullable(),
  average: z.number().nullable(),
  position: z.number().nullable(),
  rankedStudents: z.number(),
  missingSubjects: z.array(z.string()),
};

export async function getStudentReport(
  repo: Repository,
  args: { studentId: string; term?: string | undefined },
) {
  const student = await repo.getStudent(args.studentId);
  if (!student) return notFound("student", args.studentId);

  const loaded = await loadClassResults(repo, student.classId, args.term);
  if (!loaded.ok) return loaded.error;

  const own = loaded.results.find((r) => r.studentId === student.id);
  if (!own) return notFound("student", args.studentId);

  const { ranked } = rankStudents(loaded.results);
  const structured = {
    student: { id: student.id, name: student.name },
    class: { id: loaded.cls.id, name: loaded.cls.name },
    term: loaded.term,
    subjects: own.subjects,
    total: own.total,
    average: own.average,
    position: ranked.find((r) => r.studentId === student.id)?.position ?? null,
    rankedStudents: ranked.length,
    missingSubjects: own.missingSubjects,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
