import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export type EnvRecord = Record<string, string | undefined>;

export interface ResolvedEnv {
  /** Merged values. Empty strings are treated as unset. */
  readonly env: EnvRecord;
  /** The env files that actually existed and were read, in the order they were applied. */
  readonly files: readonly string[];
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

/** NODE_ENV becomes part of a file name, so only plain names are accepted. */
const SAFE_NODE_ENV = /^[A-Za-z][A-Za-z0-9-]*$/;

function withoutEmpty(values: EnvRecord): EnvRecord {
  const result: EnvRecord = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") result[key] = value;
  }
  return result;
}

function readEnvFile(filePath: string): EnvRecord | undefined {
  if (!existsSync(filePath)) return undefined;
  return withoutEmpty(parseEnv(readFileSync(filePath, "utf8")));
}

/**
 * Layers configuration, lowest priority first:
 *   1. `.env`
 *   2. `.env.<NODE_ENV>` (optional; only the values that differ from `.env`)
 *   3. real environment variables (CI, the host platform, your shell)
 *
 * Real environment variables always win, so a deployment can override any file.
 * NODE_ENV comes from the real environment and defaults to "development". It
 * only selects which file to read; it is not read from the files themselves.
 * Nothing is written to `process.env` and nothing is logged (stdout belongs to
 * the MCP protocol on the stdio transport).
 */
export function resolveEnv(options: { cwd: string; env: EnvRecord }): ResolvedEnv {
  const processEnv = withoutEmpty(options.env);
  const nodeEnv = processEnv.NODE_ENV ?? "development";

  if (!SAFE_NODE_ENV.test(nodeEnv)) {
    throw new ConfigError(
      `NODE_ENV "${nodeEnv}" is not usable: use letters, digits and hyphens only.`,
    );
  }

  const files: string[] = [];
  let merged: EnvRecord = {};

  for (const name of [".env", `.env.${nodeEnv}`]) {
    const filePath = path.join(options.cwd, name);
    const values = readEnvFile(filePath);
    if (values === undefined) continue;
    files.push(filePath);
    merged = { ...merged, ...values };
  }

  return { env: { ...merged, ...processEnv, NODE_ENV: nodeEnv }, files };
}
