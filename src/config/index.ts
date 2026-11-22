import { ConfigError, resolveEnv, type EnvRecord } from "./env-files.js";
import { envSchema, type Config } from "./schema.js";

export { ConfigError, resolveEnv } from "./env-files.js";
export type { EnvRecord, ResolvedEnv } from "./env-files.js";
export { envSchema } from "./schema.js";
export type { Config } from "./schema.js";

/**
 * Loads and validates configuration. Pass `cwd` and `env` in tests; by default
 * it reads env files from the working directory and uses `process.env`.
 */
export function loadConfig(options: { cwd?: string; env?: EnvRecord } = {}): Config {
  const { env, files } = resolveEnv({
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
  });

  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    const read = files.length > 0 ? files.join(", ") : "no env files found";
    throw new ConfigError(`Invalid configuration (${read}):\n${problems}`);
  }

  return Object.freeze({ ...result.data });
}

let cached: Config | undefined;

/** Validated configuration for the running process, loaded once on first use. */
export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}

/** Test helper: forget the cached configuration. */
export function resetConfigCache(): void {
  cached = undefined;
}
