import postgres, { type Sql } from "postgres";
import { DatabaseError } from "./errors.js";

export type DbProvider = "docker" | "local";

/**
 * A Postgres connection. The rest of the app only sees this interface, so it
 * cannot tell whether the server runs in Docker or on the developer's machine;
 * `DB_PROVIDER` decides which implementation is created.
 */
export interface Database {
  readonly provider: DbProvider;
  /** Where this points, safe to log: `host:port/name`, never credentials. */
  readonly target: string;
  /** The connection pool. It connects lazily, on the first query. */
  readonly sql: Sql;
  /** Resolves if Postgres answers; throws a `DatabaseError` with a hint if not. */
  check(): Promise<void>;
  /** Closes the pool. Safe to call when nothing ever connected. */
  close(): Promise<void>;
}

export interface DatabaseOptions {
  /** Maximum pool size. */
  readonly max?: number;
  /** Seconds to wait for a connection before giving up. */
  readonly connectTimeoutSeconds?: number;
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "CONNECT_TIMEOUT",
]);

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" ? code : undefined;
}

/** True when the server could not be reached at all (as opposed to rejecting us). */
function isNetworkError(error: unknown): boolean {
  const code = codeOf(error);
  if (code !== undefined && NETWORK_CODES.has(code)) return true;
  if (error instanceof AggregateError) return error.errors.some(isNetworkError);
  return error instanceof Error && error.cause !== undefined && isNetworkError(error.cause);
}

/** `host:port/name` for a connection URL, without the user or password. */
export function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return `${parsed.hostname}:${parsed.port || "5432"}/${name}`;
  } catch (error) {
    // Do not echo the value: it may contain a password.
    throw new DatabaseError("invalid-url", "DATABASE_URL is not a valid URL.", { cause: error });
  }
}

export abstract class PostgresDatabase implements Database {
  abstract readonly provider: DbProvider;
  readonly target: string;
  readonly sql: Sql;

  protected constructor(url: string, options: DatabaseOptions = {}) {
    this.target = describeTarget(url);
    this.sql = postgres(url, {
      max: options.max ?? 10,
      connect_timeout: options.connectTimeoutSeconds ?? 5,
      onnotice: () => {},
    });
  }

  /** What to try when the server is unreachable. Differs per provider. */
  protected abstract unreachableHint(): string;

  async check(): Promise<void> {
    try {
      await this.sql`select 1`;
    } catch (error) {
      if (isNetworkError(error)) {
        throw new DatabaseError(
          "unreachable",
          `Cannot reach Postgres at ${this.target} (provider: ${this.provider}). ${this.unreachableHint()}`,
          { cause: error },
        );
      }
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new DatabaseError(
        "rejected",
        `Postgres at ${this.target} rejected the connection: ${reason}`,
        { cause: error },
      );
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
