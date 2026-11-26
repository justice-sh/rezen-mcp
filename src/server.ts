import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SchoolRepository } from "./data/school-repository.js";
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
import { LIST_CLASSES_DESCRIPTION, listClasses, listClassesOutput } from "./tools/list-classes.js";
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

/**
 * Makes the server for one school. Every tool reads through `school`, a view that
 * is already limited to the caller's school (ADR-021, ADR-022), so no tool takes a
 * school ID and none can be asked for another school's data.
 */
export function createServer(school: SchoolRepository): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "list_classes",
    {
      title: "List classes",
      description: LIST_CLASSES_DESCRIPTION,
      outputSchema: listClassesOutput,
      annotations: READ_ONLY,
    },
    () => listClasses(school),
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
    (args) => getClassResults(school, args),
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
    (args) => getStudentReport(school, args),
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
    (args) => rankClass(school, args),
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
    (args) => findMissingScores(school, args),
  );

  registerGradingRules(server);
  registerSummariseClassTerm(server);

  return server;
}
