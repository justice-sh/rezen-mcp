import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { generateDataset } from "../src/data/synthetic.js";
import { connect } from "./helpers.js";
import { openInMemorySubject, openPostgresSubject } from "./support/postgres-subject.js";
import type { ContractSubject } from "./support/repository-contract.js";

// The whole point of the swap (ADR-004, ADR-019): a real MCP client gets the
// same answer from every tool, whichever store is behind the server.
const dataset = generateDataset();
const terms = [undefined, "2026-T1", "2026-T2", "1999-T1"];

let memory: ContractSubject;
let postgres: ContractSubject;
let memoryClient: Client;
let postgresClient: Client;

beforeAll(async () => {
  memory = await openInMemorySubject(dataset);
  postgres = await openPostgresSubject(dataset);
  memoryClient = await connect(memory.repo);
  postgresClient = await connect(postgres.repo);
});

afterAll(async () => {
  await memoryClient?.close();
  await postgresClient?.close();
  await postgres?.close();
});

async function same(name: string, args: Record<string, unknown>) {
  const [fromMemory, fromPostgres] = await Promise.all([
    memoryClient.callTool({ name, arguments: args }),
    postgresClient.callTool({ name, arguments: args }),
  ]);
  expect(fromPostgres, `${name} ${JSON.stringify(args)}`).toEqual(fromMemory);
  return fromPostgres;
}

describe("every tool answers the same from Postgres as from memory", () => {
  it("list_classes, for each school and an unknown one", async () => {
    for (const schoolId of [...dataset.schools.map((s) => s.id), "sch_nope"]) {
      await same("list_classes", { schoolId });
    }
  });

  it("get_class_results, rank_class and find_missing_scores, for each class and term", async () => {
    for (const classId of [...dataset.classes.map((c) => c.id), "nope"]) {
      for (const term of terms) {
        const args = term === undefined ? { classId } : { classId, term };
        for (const tool of ["get_class_results", "rank_class", "find_missing_scores"]) {
          await same(tool, args);
        }
      }
    }
  });

  it("get_student_report, for each student and term", async () => {
    for (const studentId of [...dataset.students.map((s) => s.id), "nope"]) {
      for (const term of [undefined, "2026-T1"]) {
        await same("get_student_report", term === undefined ? { studentId } : { studentId, term });
      }
    }
  });

  it("really compares answers: a result is not an error and is not empty", async () => {
    const result = await same("rank_class", { classId: dataset.classes[0]?.id ?? "" });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.structuredContent)).toContain("position");
  });
});
