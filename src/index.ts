#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createInMemoryRepository } from "./data/repository.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer(createInMemoryRepository());
  await server.connect(new StdioServerTransport());
  // stdout is reserved for the MCP protocol; log to stderr only.
  console.error("rezen-mcp running on stdio (synthetic data)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
