import { describe, expect, it } from "vitest";
import { generateDataset } from "../src/data/synthetic.js";
import { InMemoryRepository } from "../src/data/repository.js";
import { CLASS_ID, SCHOOL_ID, edgeCaseDataset } from "./fixtures.js";
import { describeRepositoryContract } from "./support/repository-contract.js";

const open = async (dataset: Parameters<typeof describeRepositoryContract>[1]) => ({
  repo: new InMemoryRepository(dataset),
  close: async () => {},
});

describeRepositoryContract("InMemoryRepository (edge-case data)", edgeCaseDataset(), open);
describeRepositoryContract("InMemoryRepository (synthetic data)", generateDataset(), open);
describeRepositoryContract(
  "InMemoryRepository (first term in progress)",
  { ...edgeCaseDataset(), currentTerm: "2026-T1" },
  open,
);

describe("InMemoryRepository, beyond the contract", () => {
  const repo = new InMemoryRepository(edgeCaseDataset());

  it("knows the hand-built edge-case data", async () => {
    expect((await repo.getClass(CLASS_ID))?.name).toBe("Primary 1");
    expect((await repo.getStudent("st_ada"))?.name).toBe("Ada Okoro");
    expect((await repo.getSchool(SCHOOL_ID))?.name).toBe("Test School");
    expect(await repo.listStudents(CLASS_ID)).toHaveLength(6);
    expect(await repo.listScores(CLASS_ID, "2026-T2")).toHaveLength(2);
  });
});
