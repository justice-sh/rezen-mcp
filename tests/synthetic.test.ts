import { describe, expect, it } from "vitest";
import { generateDataset } from "../src/data/synthetic.js";

describe("generateDataset", () => {
  it("is deterministic for a given seed", () => {
    expect(generateDataset({ seed: 7 })).toEqual(generateDataset({ seed: 7 }));
  });

  it("differs across seeds", () => {
    expect(generateDataset({ seed: 1 }).students).not.toEqual(
      generateDataset({ seed: 2 }).students,
    );
  });

  it("produces scores within valid ranges", () => {
    for (const s of generateDataset().scores) {
      expect(s.ca).toBeGreaterThanOrEqual(0);
      expect(s.ca).toBeLessThanOrEqual(40);
      expect(s.exam).toBeGreaterThanOrEqual(0);
      expect(s.exam).toBeLessThanOrEqual(60);
    }
  });

  it("only contains demo schools", () => {
    const ids = generateDataset().schools.map((s) => s.id);
    expect(ids.every((id) => id.startsWith("sch_demo_"))).toBe(true);
  });
});
