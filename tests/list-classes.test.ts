import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryRepository } from "../src/data/repository.js";
import { createServer } from "../src/server.js";

describe("list_classes (through a real MCP client)", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createServer(createInMemoryRepository());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("is advertised as a read-only tool", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "list_classes");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("returns the classes of a school, ordered by level", async () => {
    const result = await client.callTool({
      name: "list_classes",
      arguments: { schoolId: "sch_demo_a" },
    });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as {
      school: string;
      classes: { level: number; studentCount: number }[];
    };
    expect(data.school).toBe("Demo School A");
    expect(data.classes.length).toBeGreaterThan(0);
    expect(data.classes.map((c) => c.level)).toEqual([...data.classes.map((c) => c.level)].sort());
    expect(data.classes.every((c) => c.studentCount > 0)).toBe(true);
  });

  it("returns a clear error for an unknown school", async () => {
    const result = await client.callTool({
      name: "list_classes",
      arguments: { schoolId: "sch_does_not_exist" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Unknown school ID");
  });

  it("rejects an empty school ID", async () => {
    const result = await client.callTool({ name: "list_classes", arguments: { schoolId: "" } }).catch((e) => e);
    // Invalid input surfaces either as an isError result or a thrown protocol error.
    const failed = result instanceof Error || (result as { isError?: boolean }).isError === true;
    expect(failed).toBe(true);
  });
});
