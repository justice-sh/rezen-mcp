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
const memoryClients = new Map<string, Client>();
const postgresClients = new Map<string, Client>();
const schoolIds = dataset.schools.map((s) => s.id);

beforeAll(async () => {
  memory = await openInMemorySubject(dataset);
  postgres = await openPostgresSubject(dataset);
  // One server per school, as a token makes it (ADR-022), on each store.
  for (const schoolId of schoolIds) {
    memoryClients.set(schoolId, await connect(memory.repo, schoolId));
    postgresClients.set(schoolId, await connect(postgres.repo, schoolId));
  }
});

afterAll(async () => {
  await Promise.all([...memoryClients.values(), ...postgresClients.values()].map((c) => c.close()));
  await postgres?.close();
});

/** Calls a tool as one school on both stores and requires the same answer. */
async function same(schoolId: string, name: string, args: Record<string, unknown>) {
  const memoryClient = memoryClients.get(schoolId);
  const postgresClient = postgresClients.get(schoolId);
  if (memoryClient === undefined || postgresClient === undefined) throw new Error(schoolId);
  const [fromMemory, fromPostgres] = await Promise.all([
    memoryClient.callTool({ name, arguments: args }),
    postgresClient.callTool({ name, arguments: args }),
  ]);
  expect(fromPostgres, `${schoolId} ${name} ${JSON.stringify(args)}`).toEqual(fromMemory);
  return fromPostgres;
}

describe("every tool answers the same from Postgres as from memory", () => {
  it("list_classes, for each school", async () => {
    for (const schoolId of schoolIds) {
      await same(schoolId, "list_classes", {});
    }
  });

  it("get_class_results, rank_class and find_missing_scores, for each class and term, as each school", async () => {
    for (const schoolId of schoolIds) {
      for (const classId of [...dataset.classes.map((c) => c.id), "nope"]) {
        for (const term of terms) {
          const args = term === undefined ? { classId } : { classId, term };
          for (const tool of ["get_class_results", "rank_class", "find_missing_scores"]) {
            await same(schoolId, tool, args);
          }
        }
      }
    }
  });

  it("get_student_report, for each student and term, as each school", async () => {
    for (const schoolId of schoolIds) {
      for (const studentId of [...dataset.students.map((s) => s.id), "nope"]) {
        for (const term of [undefined, "2026-T1"]) {
          const args = term === undefined ? { studentId } : { studentId, term };
          await same(schoolId, "get_student_report", args);
        }
      }
    }
  });

  it("really compares answers: a result is not an error and is not empty", async () => {
    const first = dataset.classes[0];
    const result = await same(first?.schoolId ?? "", "rank_class", { classId: first?.id ?? "" });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.structuredContent)).toContain("position");
  });
});
