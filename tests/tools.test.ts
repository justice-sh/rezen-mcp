import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryRepository, createInMemoryRepository } from "../src/data/repository.js";
import { CLASS_ID, edgeCaseDataset, SCHOOL_ID } from "./fixtures.js";
import { callError, callOk, connect } from "./helpers.js";

interface SubjectRow {
  subject: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  missing: string | null;
}
interface ClassResults {
  class: { id: string; name: string };
  term: string;
  subjects: string[];
  students: {
    studentId: string;
    name: string;
    subjects: SubjectRow[];
    total: number | null;
    average: number | null;
  }[];
}
interface StudentReport {
  student: { id: string; name: string };
  term: string;
  subjects: SubjectRow[];
  total: number | null;
  average: number | null;
  position: number | null;
  rankedStudents: number;
  missingSubjects: string[];
}
interface Ranking {
  term: string;
  ranked: { position: number; studentId: string; name: string; total: number }[];
  unranked: { studentId: string; name: string; missingSubjects: string[] }[];
}
interface Missing {
  term: string;
  missing: { studentId: string; name: string; subject: string; component: string }[];
}

describe("tools against the edge-case fixture", () => {
  let client: Client;

  beforeEach(async () => {
    client = await connect(new InMemoryRepository(edgeCaseDataset()), SCHOOL_ID);
  });
  afterEach(async () => {
    await client.close();
  });

  it("advertises exactly the five v1 tools, all read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "find_missing_scores",
      "get_class_results",
      "get_student_report",
      "list_classes",
      "rank_class",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  describe("get_class_results", () => {
    it("returns scores, grades, totals and averages per student", async () => {
      const data = await callOk<ClassResults>(client, "get_class_results", {
        classId: CLASS_ID,
        term: "2026-T1",
      });
      expect(data.subjects).toEqual(["Maths", "English"]);
      const ada = data.students.find((s) => s.studentId === "st_ada");
      expect(ada).toMatchObject({ total: 160, average: 80 });
      expect(ada?.subjects[0]).toEqual({
        subject: "Maths",
        ca: 30,
        exam: 50,
        total: 80,
        grade: "A",
        missing: null,
      });
    });

    it("reports missing parts as null, never zero", async () => {
      const data = await callOk<ClassResults>(client, "get_class_results", {
        classId: CLASS_ID,
        term: "2026-T1",
      });
      const dayo = data.students.find((s) => s.studentId === "st_dayo");
      expect(dayo?.subjects[1]).toEqual({
        subject: "English",
        ca: 10,
        exam: null,
        total: null,
        grade: null,
        missing: "exam",
      });
      expect(dayo?.total).toBeNull();
      const emeka = data.students.find((s) => s.studentId === "st_emeka");
      expect(emeka?.subjects.every((s) => s.missing === "both")).toBe(true);
    });

    it("defaults to the current term", async () => {
      const data = await callOk<ClassResults>(client, "get_class_results", { classId: CLASS_ID });
      expect(data.term).toBe("2026-T2");
    });
  });

  describe("get_student_report", () => {
    it("gives tied students the same position", async () => {
      const ada = await callOk<StudentReport>(client, "get_student_report", {
        studentId: "st_ada",
        term: "2026-T1",
      });
      const bola = await callOk<StudentReport>(client, "get_student_report", {
        studentId: "st_bola",
        term: "2026-T1",
      });
      expect([ada.position, bola.position]).toEqual([1, 1]);
      expect(ada.rankedStudents).toBe(4);
    });

    it("skips the position after a tie", async () => {
      const chi = await callOk<StudentReport>(client, "get_student_report", {
        studentId: "st_chi",
        term: "2026-T1",
      });
      expect(chi.position).toBe(3);
      expect(chi.total).toBe(120);
    });

    it("has a null position and names the missing subjects when scores are missing", async () => {
      const dayo = await callOk<StudentReport>(client, "get_student_report", {
        studentId: "st_dayo",
        term: "2026-T1",
      });
      expect(dayo).toMatchObject({ position: null, total: null, missingSubjects: ["English"] });

      const emeka = await callOk<StudentReport>(client, "get_student_report", {
        studentId: "st_emeka",
        term: "2026-T1",
      });
      expect(emeka.missingSubjects).toEqual(["Maths", "English"]);
    });

    it("uses the requested term, so the same student can differ across terms", async () => {
      const t2 = await callOk<StudentReport>(client, "get_student_report", { studentId: "st_ada" });
      expect(t2).toMatchObject({ term: "2026-T2", total: 200, position: 1, rankedStudents: 1 });
    });
  });

  describe("rank_class", () => {
    it("ranks with ties sharing a position (1, 1, 3, 4) and lists unranked students", async () => {
      const data = await callOk<Ranking>(client, "rank_class", {
        classId: CLASS_ID,
        term: "2026-T1",
      });
      expect(data.ranked.map((r) => [r.name, r.position, r.total])).toEqual([
        ["Ada Okoro", 1, 160],
        ["Bola Eze", 1, 160],
        ["Chi Musa", 3, 120],
        ["Fola Ojo", 4, 100],
      ]);
      expect(data.unranked).toEqual([
        { studentId: "st_dayo", name: "Dayo Obi", missingSubjects: ["English"] },
        { studentId: "st_emeka", name: "Emeka Sani", missingSubjects: ["Maths", "English"] },
      ]);
    });

    it("ranks the current term when none is given", async () => {
      const data = await callOk<Ranking>(client, "rank_class", { classId: CLASS_ID });
      expect(data.term).toBe("2026-T2");
      expect(data.ranked).toHaveLength(1);
      expect(data.unranked).toHaveLength(5);
    });
  });

  describe("default term", () => {
    it("is the current term even when a later term already has data", async () => {
      const earlier = await connect(
        new InMemoryRepository({ ...edgeCaseDataset(), currentTerm: "2026-T1" }),
        SCHOOL_ID,
      );
      const data = await callOk<Ranking>(earlier, "rank_class", { classId: CLASS_ID });
      expect(data.term).toBe("2026-T1");
      expect(data.ranked).toHaveLength(4);
      await earlier.close();
    });

    it("is stated in every response, so callers always know which term they got", async () => {
      for (const name of ["get_class_results", "rank_class", "find_missing_scores"]) {
        const data = await callOk<{ term: string }>(client, name, { classId: CLASS_ID });
        expect(data.term).toBe("2026-T2");
      }
    });
  });

  describe("find_missing_scores", () => {
    it("lists each missing entry with the missing component", async () => {
      const data = await callOk<Missing>(client, "find_missing_scores", {
        classId: CLASS_ID,
        term: "2026-T1",
      });
      expect(data.missing.map((m) => [m.studentId, m.subject, m.component])).toEqual([
        ["st_dayo", "English", "exam"],
        ["st_emeka", "Maths", "both"],
        ["st_emeka", "English", "both"],
      ]);
    });
  });

  describe("errors share one shape", () => {
    it("returns a clear error for an unknown class", async () => {
      for (const name of ["get_class_results", "rank_class", "find_missing_scores"]) {
        const text = await callError(client, name, { classId: "nope" });
        expect(text).toContain("Unknown class ID 'nope'");
      }
    });

    it("returns a clear error for an unknown student", async () => {
      const text = await callError(client, "get_student_report", { studentId: "nope" });
      expect(text).toContain("Unknown student ID 'nope'");
    });

    it("lists the valid terms when the term is unknown", async () => {
      for (const name of ["get_class_results", "rank_class", "find_missing_scores"]) {
        const text = await callError(client, name, { classId: CLASS_ID, term: "2030-T9" });
        expect(text).toContain("Unknown term '2030-T9'");
        expect(text).toContain("2026-T1, 2026-T2");
      }
      const text = await callError(client, "get_student_report", {
        studentId: "st_ada",
        term: "2030-T9",
      });
      expect(text).toContain("Valid terms");
    });

    it("rejects empty IDs", async () => {
      const result = await client
        .callTool({ name: "rank_class", arguments: { classId: "" } })
        .catch((e: unknown) => e);
      const failed = result instanceof Error || (result as { isError?: boolean }).isError === true;
      expect(failed).toBe(true);
    });
  });
});

describe("tools against the generated synthetic dataset", () => {
  let client: Client;

  beforeEach(async () => {
    client = await connect(createInMemoryRepository(), "sch_demo_a");
  });
  afterEach(async () => {
    await client.close();
  });

  it("ranked plus unranked students add up to the class size", async () => {
    const classes = await callOk<{ classes: { id: string; studentCount: number }[] }>(
      client,
      "list_classes",
      {},
    );
    for (const c of classes.classes) {
      const data = await callOk<Ranking>(client, "rank_class", { classId: c.id });
      expect(data.ranked.length + data.unranked.length).toBe(c.studentCount);
    }
  });

  it("find_missing_scores agrees with rank_class about who is incomplete", async () => {
    const ranking = await callOk<Ranking>(client, "rank_class", { classId: "sch_demo_a_c1" });
    const missing = await callOk<Missing>(client, "find_missing_scores", {
      classId: "sch_demo_a_c1",
    });
    expect(new Set(missing.missing.map((m) => m.studentId))).toEqual(
      new Set(ranking.unranked.map((u) => u.studentId)),
    );
  });

  it("class results cover every student in the class", async () => {
    // School B's own server: its classes are reachable there, and only there.
    const schoolB = await connect(createInMemoryRepository(), "sch_demo_b");
    try {
      const data = await callOk<ClassResults>(schoolB, "get_class_results", {
        classId: "sch_demo_b_c2",
      });
      expect(data.students).toHaveLength(12);
      expect(data.subjects).toHaveLength(4);
    } finally {
      await schoolB.close();
    }
  });
});
