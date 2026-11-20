import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Repository } from "./data/repository.js";
import {
  LIST_CLASSES_DESCRIPTION,
  listClasses,
  listClassesInput,
  listClassesOutput,
} from "./tools/list-classes.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

export function createServer(repo: Repository): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "list_classes",
    {
      title: "List classes",
      description: LIST_CLASSES_DESCRIPTION,
      inputSchema: listClassesInput,
      outputSchema: listClassesOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => listClasses(repo, args),
  );

  return server;
}
