import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDataset } from "../src/data/synthetic.js";
import { connect } from "./helpers.js";
import { openPostgresSubject } from "./support/postgres-subject.js";
import type { ContractSubject } from "./support/repository-contract.js";

interface ClassList {
  school: string;
  classes: { id: string; level: number; studentCount: number }[];
}

describe("list_classes (through a real MCP client, over Postgres)", () => {
  let subject: ContractSubject;
  let client: Client;

  beforeAll(async () => {
    subject = await openPostgresSubject(generateDataset());
    client = await connect(subject.repo, "sch_demo_a");
  });

  afterAll(async () => {
    await client?.close();
    await subject?.close();
  });

  it("is advertised as a read-only tool that takes no input", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "list_classes");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual([]);
  });

  it("returns the classes of the caller's school, ordered by level", async () => {
    const result = await client.callTool({ name: "list_classes", arguments: {} });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as ClassList;
    expect(data.school).toBe("Demo School A");
    expect(data.classes.length).toBeGreaterThan(0);
    expect(data.classes.every((c) => c.id.startsWith("sch_demo_a_"))).toBe(true);
    expect(data.classes.map((c) => c.level)).toEqual([...data.classes.map((c) => c.level)].sort());
    expect(data.classes.every((c) => c.studentCount > 0)).toBe(true);
  });

  it("ignores a schoolId argument: the school comes from the token, never from the caller", async () => {
    const plain = await client.callTool({ name: "list_classes", arguments: {} });
    const asked = await client.callTool({
      name: "list_classes",
      arguments: { schoolId: "sch_demo_b" },
    });
    expect(asked.isError).toBeFalsy();
    expect(asked.structuredContent).toEqual(plain.structuredContent);
    expect((asked.structuredContent as ClassList).school).toBe("Demo School A");
  });

  it("gives school B its own classes when the server serves school B", async () => {
    const schoolB = await connect(subject.repo, "sch_demo_b");
    try {
      const data = (await schoolB.callTool({ name: "list_classes", arguments: {} }))
        .structuredContent as ClassList;
      expect(data.school).toBe("Demo School B");
      expect(data.classes.every((c) => c.id.startsWith("sch_demo_b_"))).toBe(true);
    } finally {
      await schoolB.close();
    }
  });
});
