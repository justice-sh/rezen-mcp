import { parseArgs } from "node:util";
import type { TokenRecord, TokenStore } from "./token-store.js";

export const TOKEN_USAGE = `Usage:
  pnpm db:token issue <schoolId> [--label <text>]   make a token for a school (shown once)
  pnpm db:token list [--school <schoolId>]          list tokens (never their values)
  pnpm db:token revoke <tokenId>                    stop a token from working`;

/** A problem with how the command was typed, as opposed to a failure while running it. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}

/**
 * Runs one `db:token` command against a token store and returns the lines to
 * print. It does no printing itself, so tests can read what a person would see.
 * Throws `UsageError` for a command that was typed wrongly.
 */
export async function runTokenCommand(store: TokenStore, argv: string[]): Promise<string[]> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        label: { type: "string" },
        school: { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const [command, ...rest] = parsed.positionals;
  const { label, school } = parsed.values;

  switch (command) {
    case "issue": {
      const [schoolId, ...extra] = rest;
      if (schoolId === undefined || extra.length > 0) {
        throw new UsageError("issue needs exactly one school id.");
      }
      if (school !== undefined) throw new UsageError("issue does not take --school.");
      const issued = await store.issue(schoolId, label === undefined ? {} : { label });
      return [
        `Issued a token for school ${issued.schoolId}.`,
        `  id:    ${issued.id}`,
        `  token: ${issued.token}`,
        "",
        "Store the token now. It is shown once and cannot be recovered: only its hash is kept.",
      ];
    }
    case "list": {
      if (rest.length > 0) throw new UsageError("list takes no positional arguments.");
      if (label !== undefined) throw new UsageError("list does not take --label.");
      const records = await store.list(school);
      if (records.length === 0) return ["No tokens."];
      return records.map(describeRecord);
    }
    case "revoke": {
      const [tokenId, ...extra] = rest;
      if (tokenId === undefined || extra.length > 0) {
        throw new UsageError("revoke needs exactly one token id.");
      }
      if (label !== undefined || school !== undefined) {
        throw new UsageError("revoke takes no options.");
      }
      return (await store.revoke(tokenId))
        ? [`Revoked token ${tokenId}.`]
        : [`No active token with id ${tokenId} (it is unknown or already revoked).`];
    }
    default:
      throw new UsageError(
        command === undefined ? "Say what to do." : `Unknown command "${command}".`,
      );
  }
}

function describeRecord(record: TokenRecord): string {
  const state = record.revokedAt === null ? "active" : `revoked ${record.revokedAt.toISOString()}`;
  const label = record.label === null ? "" : `  "${record.label}"`;
  return `${record.id}  ${record.schoolId}  ${state}  created ${record.createdAt.toISOString()}${label}`;
}
