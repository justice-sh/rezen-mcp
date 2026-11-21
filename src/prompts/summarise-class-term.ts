import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GRADING_RULES_URI } from "../resources/grading-rules.js";

export function summariseClassTermText(classId: string, term: string | undefined): string {
  const termText = term === undefined ? "the current term" : `term ${term}`;
  return [
    `Write a short summary of results for class ${classId} for ${termText}.`,
    "",
    "Use the tools, and do not guess any numbers:",
    "1. rank_class for positions and the unranked students.",
    "2. get_class_results for subject scores and grades.",
    "3. find_missing_scores for data gaps.",
    `Read ${GRADING_RULES_URI} first if you need to explain how grades or ranks are worked out.`,
    "",
    "Cover: class size, the top three positions (say so if there are ties), the strongest and weakest subjects, " +
      "and how many students are unranked and why.",
    "State which term the results are for. Never treat a missing score as zero. If data is incomplete, say what is missing.",
  ].join("\n");
}

export function registerSummariseClassTerm(server: McpServer): void {
  server.registerPrompt(
    "summarise_class_term",
    {
      title: "Summarise a class's term",
      description: "Ask for a short, tool-grounded summary of one class's results for a term.",
      argsSchema: {
        classId: z.string().min(1).describe("Class ID from list_classes."),
        term: z.string().min(1).optional().describe("Term ID. Defaults to the current term."),
      },
    },
    ({ classId, term }) => ({
      messages: [
        { role: "user", content: { type: "text", text: summariseClassTermText(classId, term) } },
      ],
    }),
  );
}
