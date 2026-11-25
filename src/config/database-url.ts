import { z } from "zod";

/** Which Postgres runs behind DATABASE_URL. */
export const dbProviderSchema = z.enum(["docker", "local"]);

export const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

/**
 * An environment variable is always a string, so the map form of DATABASE_URL
 * arrives as JSON. A value starting with "{" is parsed; anything else, including
 * JSON that does not parse, is left as it is and fails the URL check, which
 * reports "Invalid URL" without echoing the value (it holds a password).
 */
export function parseUrlMap(value: unknown): unknown {
  if (typeof value !== "string" || !value.trimStart().startsWith("{")) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
