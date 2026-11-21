import { describe, expect, it } from "vitest";
import {
  computeStudentResult,
  computeSubjectResult,
  gradeFor,
  gradingRulesText,
  rankStudents,
  type StudentResult,
} from "../src/domain/grading.js";

describe("gradeFor", () => {
  it.each([
    [100, "A"],
    [70, "A"],
    [69, "B"],
    [60, "B"],
    [59, "C"],
    [50, "C"],
    [49, "D"],
    [45, "D"],
    [44, "E"],
    [40, "E"],
    [39, "F"],
    [0, "F"],
  ])("maps %i to %s", (total, grade) => {
    expect(gradeFor(total)).toBe(grade);
  });
});

describe("computeSubjectResult", () => {
  it("computes total and grade for a complete entry", () => {
    const r = computeSubjectResult("Maths", {
      studentId: "s",
      subject: "Maths",
      term: "T1",
      ca: 30,
      exam: 45,
    });
    expect(r).toEqual({ subject: "Maths", ca: 30, exam: 45, total: 75, grade: "A", missing: null });
  });

  it("reports a missing exam without treating it as zero", () => {
    const r = computeSubjectResult("Maths", {
      studentId: "s",
      subject: "Maths",
      term: "T1",
      ca: 30,
      exam: null,
    });
    expect(r).toMatchObject({ ca: 30, exam: null, total: null, grade: null, missing: "exam" });
  });

  it("reports a missing CA", () => {
    const r = computeSubjectResult("Maths", {
      studentId: "s",
      subject: "Maths",
      term: "T1",
      ca: null,
      exam: 20,
    });
    expect(r.missing).toBe("ca");
    expect(r.total).toBeNull();
  });

  it("reports both missing when there is no entry at all", () => {
    expect(computeSubjectResult("Maths", undefined)).toEqual({
      subject: "Maths",
      ca: null,
      exam: null,
      total: null,
      grade: null,
      missing: "both",
    });
  });

  it("keeps a genuine zero score distinct from a missing one", () => {
    const r = computeSubjectResult("Maths", {
      studentId: "s",
      subject: "Maths",
      term: "T1",
      ca: 0,
      exam: 0,
    });
    expect(r).toMatchObject({ total: 0, grade: "F", missing: null });
  });
});

describe("computeStudentResult", () => {
  const student = { id: "s1", classId: "c", name: "Ada" };

  it("totals and averages when every subject is complete", () => {
    const r = computeStudentResult(
      student,
      ["Maths", "English"],
      [
        { studentId: "s1", subject: "Maths", term: "T1", ca: 30, exam: 50 },
        { studentId: "s1", subject: "English", term: "T1", ca: 20, exam: 41 },
      ],
    );
    expect(r.total).toBe(141);
    expect(r.average).toBe(70.5);
    expect(r.missingSubjects).toEqual([]);
  });

  it("has no total or average when any subject is incomplete", () => {
    const r = computeStudentResult(
      student,
      ["Maths", "English"],
      [{ studentId: "s1", subject: "Maths", term: "T1", ca: 30, exam: 50 }],
    );
    expect(r.total).toBeNull();
    expect(r.average).toBeNull();
    expect(r.missingSubjects).toEqual(["English"]);
  });

  it("ignores other students' scores", () => {
    const r = computeStudentResult(
      student,
      ["Maths"],
      [{ studentId: "someone_else", subject: "Maths", term: "T1", ca: 40, exam: 60 }],
    );
    expect(r.subjects[0]?.missing).toBe("both");
  });

  it("rounds the average to two decimals", () => {
    const r = computeStudentResult(
      student,
      ["A", "B", "C"],
      [
        { studentId: "s1", subject: "A", term: "T1", ca: 10, exam: 10 },
        { studentId: "s1", subject: "B", term: "T1", ca: 10, exam: 10 },
        { studentId: "s1", subject: "C", term: "T1", ca: 10, exam: 11 },
      ],
    );
    expect(r.total).toBe(61);
    expect(r.average).toBe(20.33);
  });
});

function result(
  id: string,
  name: string,
  total: number | null,
  missing: string[] = [],
): StudentResult {
  return { studentId: id, name, subjects: [], total, average: null, missingSubjects: missing };
}

describe("rankStudents", () => {
  it("ranks by total, highest first", () => {
    const { ranked } = rankStudents([result("a", "A", 100), result("b", "B", 150)]);
    expect(ranked.map((r) => [r.studentId, r.position])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("gives tied students the same position and skips the next (1, 1, 3, 4)", () => {
    const { ranked } = rankStudents([
      result("c", "Chi", 120),
      result("a", "Ada", 160),
      result("b", "Bola", 160),
      result("f", "Fola", 100),
    ]);
    expect(ranked.map((r) => r.position)).toEqual([1, 1, 3, 4]);
  });

  it("orders ties by name for deterministic output", () => {
    const { ranked } = rankStudents([result("b", "Bola", 160), result("a", "Ada", 160)]);
    expect(ranked.map((r) => r.name)).toEqual(["Ada", "Bola"]);
  });

  it("handles a three-way tie", () => {
    const { ranked } = rankStudents([
      result("a", "A", 90),
      result("b", "B", 90),
      result("c", "C", 90),
      result("d", "D", 80),
    ]);
    expect(ranked.map((r) => r.position)).toEqual([1, 1, 1, 4]);
  });

  it("puts students with missing scores in unranked, with the missing subjects", () => {
    const { ranked, unranked } = rankStudents([
      result("a", "Ada", 160),
      result("d", "Dayo", null, ["English"]),
    ]);
    expect(ranked).toHaveLength(1);
    expect(unranked).toEqual([{ studentId: "d", name: "Dayo", missingSubjects: ["English"] }]);
  });

  it("returns empty lists for an empty class", () => {
    expect(rankStudents([])).toEqual({ ranked: [], unranked: [] });
  });
});

describe("gradingRulesText", () => {
  it("describes every grade band and the tie rule", () => {
    const text = gradingRulesText();
    expect(text).toContain("- A: 70 to 100");
    expect(text).toContain("- B: 60 to 69");
    expect(text).toContain("- F: 0 to 39");
    expect(text).toContain("1, 2, 2, 4");
  });
});
