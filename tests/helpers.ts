import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Repository } from "../src/data/repository.js";
import { createServer } from "../src/server.js";

/** Connect a real MCP client to a real server over an in-memory transport. */
export async function connect(repo: Repository): Promise<Client> {
  const server = createServer(repo);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Call a tool and return its structured output, failing loudly on tool errors. */
export async function callOk<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`Tool ${name} failed: ${JSON.stringify(result.content)}`);
  }
  return result.structuredContent as T;
}

/** Call a tool that is expected to fail and return its error text. */
export async function callError(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  expectError(result.isError);
  const content = result.content as { type: string; text: string }[];
  return content.map((c) => c.text).join("\n");
}

function expectError(isError: unknown): void {
  if (isError !== true) throw new Error("Expected the tool call to return isError: true");
}
