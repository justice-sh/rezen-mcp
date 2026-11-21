import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Repository } from "./data/repository.js";
import {
  FIND_MISSING_SCORES_DESCRIPTION,
  findMissingScores,
  findMissingScoresInput,
  findMissingScoresOutput,
} from "./tools/find-missing-scores.js";
import {
  GET_CLASS_RESULTS_DESCRIPTION,
  getClassResults,
  getClassResultsInput,
  getClassResultsOutput,
} from "./tools/get-class-results.js";
import {
  GET_STUDENT_REPORT_DESCRIPTION,
  getStudentReport,
  getStudentReportInput,
  getStudentReportOutput,
} from "./tools/get-student-report.js";
import {
  LIST_CLASSES_DESCRIPTION,
  listClasses,
  listClassesInput,
  listClassesOutput,
} from "./tools/list-classes.js";
import {
  RANK_CLASS_DESCRIPTION,
  rankClass,
  rankClassInput,
  rankClassOutput,
} from "./tools/rank-class.js";
import { registerSummariseClassTerm } from "./prompts/summarise-class-term.js";
import { registerGradingRules } from "./resources/grading-rules.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

/** Every tool is read-only and only touches this server's own data. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function createServer(repo: Repository): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "list_classes",
    {
      title: "List classes",
      description: LIST_CLASSES_DESCRIPTION,
      inputSchema: listClassesInput,
      outputSchema: listClassesOutput,
      annotations: READ_ONLY,
    },
    (args) => listClasses(repo, args),
  );

  server.registerTool(
    "get_class_results",
    {
      title: "Get class results",
      description: GET_CLASS_RESULTS_DESCRIPTION,
      inputSchema: getClassResultsInput,
      outputSchema: getClassResultsOutput,
      annotations: READ_ONLY,
    },
    (args) => getClassResults(repo, args),
  );

  server.registerTool(
    "get_student_report",
    {
      title: "Get student report",
      description: GET_STUDENT_REPORT_DESCRIPTION,
      inputSchema: getStudentReportInput,
      outputSchema: getStudentReportOutput,
      annotations: READ_ONLY,
    },
    (args) => getStudentReport(repo, args),
  );

  server.registerTool(
    "rank_class",
    {
      title: "Rank class",
      description: RANK_CLASS_DESCRIPTION,
      inputSchema: rankClassInput,
      outputSchema: rankClassOutput,
      annotations: READ_ONLY,
    },
    (args) => rankClass(repo, args),
  );

  server.registerTool(
    "find_missing_scores",
    {
      title: "Find missing scores",
      description: FIND_MISSING_SCORES_DESCRIPTION,
      inputSchema: findMissingScoresInput,
      outputSchema: findMissingScoresOutput,
      annotations: READ_ONLY,
    },
    (args) => findMissingScores(repo, args),
  );

  registerGradingRules(server);
  registerSummariseClassTerm(server);

  return server;
}
