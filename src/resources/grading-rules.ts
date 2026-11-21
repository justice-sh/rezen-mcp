import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gradingRulesText } from "../domain/grading.js";

export const GRADING_RULES_URI = "rezen://grading-rules";

/** Lets assistants read the grading rules and explain results consistently. */
export function registerGradingRules(server: McpServer): void {
  server.registerResource(
    "grading-rules",
    GRADING_RULES_URI,
    {
      title: "Grading rules",
      description:
        "How totals, grades and rankings are computed, including how ties and missing scores are handled.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: gradingRulesText() }],
    }),
  );
}
