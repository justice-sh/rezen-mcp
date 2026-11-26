/** One error shape for every tool: `isError: true` with a single, actionable message. */
export function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export type ToolError = ReturnType<typeof errorResult>;

export function notFound(kind: "class" | "student", id: string): ToolError {
  return errorResult(`Unknown ${kind} ID '${id}'. Check the ID and try again.`);
}

export function unknownTerm(term: string, validTerms: readonly string[]): ToolError {
  return errorResult(`Unknown term '${term}'. Valid terms: ${validTerms.join(", ")}.`);
}
