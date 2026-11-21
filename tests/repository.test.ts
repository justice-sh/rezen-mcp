import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "../src/data/repository.js";
import { CLASS_ID, SCHOOL_ID, edgeCaseDataset } from "./fixtures.js";

describe("InMemoryRepository", () => {
  const repo = new InMemoryRepository(edgeCaseDataset());

  it("finds classes and students by ID, and returns undefined for unknown IDs", async () => {
    expect((await repo.getClass(CLASS_ID))?.name).toBe("Primary 1");
    expect(await repo.getClass("nope")).toBeUndefined();
    expect((await repo.getStudent("st_ada"))?.name).toBe("Ada Okoro");
    expect(await repo.getStudent("nope")).toBeUndefined();
    expect((await repo.getSchool(SCHOOL_ID))?.name).toBe("Test School");
  });

  it("lists the students of a class", async () => {
    expect(await repo.listStudents(CLASS_ID)).toHaveLength(6);
    expect(await repo.listStudents("nope")).toEqual([]);
  });

  it("lists scores for one term only", async () => {
    const t1 = await repo.listScores(CLASS_ID, "2026-T1");
    const t2 = await repo.listScores(CLASS_ID, "2026-T2");
    expect(t1.every((s) => s.term === "2026-T1")).toBe(true);
    expect(t2).toHaveLength(2);
  });

  it("returns subjects and terms in order, as copies", async () => {
    const subjects = await repo.listSubjects();
    expect(subjects).toEqual(["Maths", "English"]);
    subjects.push("mutated");
    expect(await repo.listSubjects()).toEqual(["Maths", "English"]);
    expect(await repo.listTerms()).toEqual(["2026-T1", "2026-T2"]);
  });

  it("reports the current term, which is not just the latest term with data", async () => {
    expect(await repo.getCurrentTerm()).toBe("2026-T2");

    // T1 is in progress here even though T2 already has data.
    const earlier = new InMemoryRepository({ ...edgeCaseDataset(), currentTerm: "2026-T1" });
    expect(await earlier.getCurrentTerm()).toBe("2026-T1");
  });
});
