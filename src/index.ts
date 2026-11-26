#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openSchoolAccess } from "./auth/school-access.js";
import { getConfig } from "./config/index.js";
import { openDataStore } from "./data/store.js";
import { createServer } from "./server.js";

async function main() {
  const config = getConfig();
  const store = await openDataStore(config);

  let server;
  let access;
  try {
    // Who is calling is settled once, here, before any tool exists (ADR-022).
    access = await openSchoolAccess(store, config);
    server = createServer(access.repository);
  } catch (error) {
    await store.close();
    throw error;
  }

  // Close the database when the client goes away or the process is stopped, or
  // an open Postgres pool would keep the process alive.
  server.server.onclose = () => void store.close();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void store.close().finally(() => process.exit(0)));
  }
  process.stdin.once("end", () => void store.close().finally(() => process.exit(0)));

  await server.connect(new StdioServerTransport());
  // stdout is reserved for the MCP protocol; log to stderr only.
  console.error(`rezen-mcp running on stdio (${store.description}, ${access.description})`);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
