import type { Config } from "../config/index.js";
import type { DataStore } from "../data/store.js";
import { scopeToSchool, type SchoolRepository } from "../data/school-repository.js";
import { TokenError } from "./errors.js";
import type { TokenStore } from "./token-store.js";

/** Who is calling, as the server needs to know it: one school's view of the data. */
export interface SchoolAccess {
  readonly repository: SchoolRepository;
  /** Short and safe to log: names the school, never the token. */
  readonly description: string;
}

/**
 * Works out which school this server instance serves, once, at startup (ADR-022).
 *
 * `SCHOOL_TOKEN` is required and is checked against the stored hashes. The school
 * comes from the token, never from anything the caller sends. The view is built over
 * a repository that Postgres itself limits to that school (ADR-024), so there are two
 * layers: the view, and row-level security under it.
 *
 * Throws a `TokenError` that says what to fix. Messages never contain the token, and
 * a malformed, unknown and revoked token all give the same message (ADR-020).
 */
export async function openSchoolAccess(
  store: {
    readonly repositoryFor: DataStore["repositoryFor"];
    readonly tokens: Pick<TokenStore, "verify">;
  },
  config: Pick<Config, "SCHOOL_TOKEN">,
): Promise<SchoolAccess> {
  if (config.SCHOOL_TOKEN === undefined) {
    throw new TokenError(
      "token-missing",
      'SCHOOL_TOKEN is not set. Make a token with "pnpm db:token issue <schoolId>" and set it as SCHOOL_TOKEN.',
    );
  }
  const verified = await store.tokens.verify(config.SCHOOL_TOKEN);
  if (verified === undefined) {
    throw new TokenError(
      "token-rejected",
      'SCHOOL_TOKEN was not accepted: it is malformed, unknown or revoked. Check it, or make a new one with "pnpm db:token issue <schoolId>".',
    );
  }

  const repository = scopeToSchool(store.repositoryFor(verified.schoolId), verified.schoolId);
  const school = await repository.getSchool();
  if (school === undefined) {
    throw new TokenError("unknown-school", `There is no school with id "${verified.schoolId}".`);
  }
  return { repository, description: `school ${school.id}` };
}
