import type { SchoolRepository } from "../data/school-repository.js";
import { unknownTerm, type ToolError } from "./errors.js";

export type TermResolution = { ok: true; term: string } | { ok: false; error: ToolError };

/**
 * Every result is termly. A caller may omit the term, which means the school's
 * current term (the term in progress), not merely the latest term that has data
 * (see docs/DECISIONS.md, ADR-009).
 */
export async function resolveTerm(
  repo: Pick<SchoolRepository, "getCurrentTerm" | "listTerms">,
  requested: string | undefined,
): Promise<TermResolution> {
  if (requested === undefined) {
    return { ok: true, term: await repo.getCurrentTerm() };
  }
  const terms = await repo.listTerms();
  return terms.includes(requested)
    ? { ok: true, term: requested }
    : { ok: false, error: unknownTerm(requested, terms) };
}
