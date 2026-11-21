import { describe, expect, it } from "vitest";
import { TERMS, generateDataset } from "../src/data/synthetic.js";

describe("generateDataset", () => {
  it("is deterministic for a given seed", () => {
    expect(generateDataset({ seed: 7 })).toEqual(generateDataset({ seed: 7 }));
  });

  it("differs across seeds", () => {
    expect(generateDataset({ seed: 1 }).students).not.toEqual(
      generateDataset({ seed: 2 }).students,
    );
  });

  it("produces scores within valid ranges (ignoring missing parts)", () => {
    for (const s of generateDataset().scores) {
      if (s.ca !== null) {
        expect(s.ca).toBeGreaterThanOrEqual(0);
        expect(s.ca).toBeLessThanOrEqual(40);
      }
      if (s.exam !== null) {
        expect(s.exam).toBeGreaterThanOrEqual(0);
        expect(s.exam).toBeLessThanOrEqual(60);
      }
    }
  });

  it("only contains demo schools", () => {
    const ids = generateDataset().schools.map((s) => s.id);
    expect(ids.every((id) => id.startsWith("sch_demo_"))).toBe(true);
  });

  it("covers every configured term and subject", () => {
    const data = generateDataset();
    expect(data.terms).toEqual([...TERMS]);
    expect(new Set(data.scores.map((s) => s.term))).toEqual(new Set(TERMS));
    expect(new Set(data.scores.map((s) => s.subject))).toEqual(new Set(data.subjects));
  });

  it("has a current term that is one of the terms, and it can be overridden", () => {
    const data = generateDataset();
    expect(data.terms).toContain(data.currentTerm);
    expect(data.currentTerm).toBe("2026-T2");
    expect(generateDataset({ currentTerm: "2026-T1" }).currentTerm).toBe("2026-T1");
  });

  it("includes some missing and partial scores so edge cases are exercised", () => {
    const data = generateDataset();
    const expectedEntries = data.students.length * data.terms.length * data.subjects.length;
    expect(data.scores.length).toBeLessThan(expectedEntries);
    expect(data.scores.some((s) => s.ca === null || s.exam === null)).toBe(true);
  });

  it("can generate a dataset with no missing scores", () => {
    const data = generateDataset({ missingScoreRate: 0, partialScoreRate: 0 });
    expect(data.scores).toHaveLength(
      data.students.length * data.terms.length * data.subjects.length,
    );
    expect(data.scores.every((s) => s.ca !== null && s.exam !== null)).toBe(true);
  });
});
