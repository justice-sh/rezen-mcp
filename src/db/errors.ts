export type DatabaseErrorKind =
  | "invalid-url"
  | "unreachable"
  | "rejected"
  | "not-migrated"
  | "no-current-term"
  | "not-test-mode"
  | "no-app-role";

/** A database problem. Messages never contain credentials. */
export class DatabaseError extends Error {
  override readonly name = "DatabaseError";

  constructor(
    readonly kind: DatabaseErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * Drizzle wraps the driver's error, so the Postgres error (the one with a SQLSTATE
 * `code`) can be a `cause`. Returns it, or undefined if there is none.
 */
export function findSqlError(error: unknown): (Error & { code: string }) | undefined {
  for (let current = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    if ("code" in current && typeof current.code === "string") {
      return current as Error & { code: string };
    }
    current = current.cause;
  }
  return undefined;
}

/** The error for a database that has no tables yet. One message, so every caller says the same thing. */
export function notMigrated(cause: unknown): DatabaseError {
  return new DatabaseError(
    "not-migrated",
    'The database has no tables yet. Run "pnpm db:migrate" first (or "pnpm pre-deploy", which migrates and then seeds).',
    { cause },
  );
}
