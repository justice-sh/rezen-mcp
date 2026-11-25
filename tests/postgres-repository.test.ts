import { afterEach, describe, expect, it } from "vitest";
import { generateDataset } from "../src/data/synthetic.js";
import { DatabaseError, migrateDatabase, PostgresRepository } from "../src/db/index.js";
import { edgeCaseDataset } from "./fixtures.js";
import { describeRepositoryContract } from "./support/repository-contract.js";
import { openPostgresSubject, seededDatabase } from "./support/postgres-subject.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

describeRepositoryContract(
  "PostgresRepository (edge-case data)",
  edgeCaseDataset(),
  openPostgresSubject,
);
describeRepositoryContract(
  "PostgresRepository (synthetic data)",
  generateDataset(),
  openPostgresSubject,
);
describeRepositoryContract(
  "PostgresRepository (first term in progress)",
  { ...edgeCaseDataset(), currentTerm: "2026-T1" },
  openPostgresSubject,
);

describe("PostgresRepository, beyond the contract", () => {
  const opened: TestDatabase[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((db) => db.close()));
  });

  it("fails clearly when no term is current, instead of guessing one", async () => {
    const db = await seededDatabase(edgeCaseDataset());
    opened.push(db);
    await db.sql`update terms set is_current = false`;

    const repo = new PostgresRepository(db);
    const error = await repo.getCurrentTerm().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).kind).toBe("no-current-term");
    expect((error as DatabaseError).message).toContain("pnpm db:seed");
    // Everything else still answers.
    expect(await repo.listTerms()).toEqual(["2026-T1", "2026-T2"]);
  });

  it("answers with empty lists, not errors, from a migrated database with no data", async () => {
    const db = await createTestDatabase();
    opened.push(db);
    await migrateDatabase(db);

    const repo = new PostgresRepository(db);
    expect(await repo.listSubjects()).toEqual([]);
    expect(await repo.listTerms()).toEqual([]);
    expect(await repo.getSchool("sch_demo_a")).toBeUndefined();
    expect(await repo.listClasses("sch_demo_a")).toEqual([]);
  });

  it("treats SQL-looking IDs as plain text", async () => {
    const db = await seededDatabase(edgeCaseDataset());
    opened.push(db);
    const repo = new PostgresRepository(db);

    expect(await repo.getStudent("x'; drop table students; --")).toBeUndefined();
    expect(await repo.listClasses("' or '1'='1")).toEqual([]);
    expect(await repo.listStudents("c1' or '1'='1")).toEqual([]);
    expect((await repo.getStudent("st_ada"))?.name).toBe("Ada Okoro");
  });
});
