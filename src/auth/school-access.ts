import type { Config } from "../config/index.js";
import type { DataStore } from "../data/store.js";
import { scopeToSchool, type SchoolRepository } from "../data/school-repository.js";
import { TokenError } from "./errors.js";

/** The school the in-memory store serves when `SCHOOL_ID` is not set (ADR-022). */
export const DEFAULT_MEMORY_SCHOOL_ID = "sch_demo_a";

/** Who is calling, as the server needs to know it: one school's view of the data. */
export interface SchoolAccess {
  readonly repository: SchoolRepository;
  /** Short and safe to log: names the school, never the token. */
  readonly description: string;
}

/**
 * Works out which school this server instance serves, once, at startup (ADR-022).
 *
 * - Postgres: `SCHOOL_TOKEN` is required and is checked against the stored hashes.
 *   The school comes from the token, never from anything the caller sends.
 * - Memory: there are no tokens, so `SCHOOL_ID` picks the school (default `sch_demo_a`).
 *
 * Throws a `TokenError` that says what to fix. Messages never contain the token, and
 * a malformed, unknown and revoked token all give the same message (ADR-020).
 */
export async function openSchoolAccess(
  store: Pick<DataStore, "repository" | "tokens">,
  config: Pick<Config, "SCHOOL_TOKEN" | "SCHOOL_ID">,
): Promise<SchoolAccess> {
  const schoolId = await resolveSchoolId(store, config);
  const repository = scopeToSchool(store.repository, schoolId);

  const school = await repository.getSchool();
  if (school === undefined) {
    throw new TokenError("unknown-school", `There is no school with id "${schoolId}".`);
  }
  return { repository, description: `school ${school.id}` };
}

async function resolveSchoolId(
  store: Pick<DataStore, "tokens">,
  config: Pick<Config, "SCHOOL_TOKEN" | "SCHOOL_ID">,
): Promise<string> {
  if (store.tokens === undefined) {
    return config.SCHOOL_ID ?? DEFAULT_MEMORY_SCHOOL_ID;
  }

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
  return verified.schoolId;
}
