import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { Database } from "./database.js";
import { DatabaseError, findSqlError } from "./errors.js";

/**
 * What both a Drizzle database and a Drizzle transaction can do, so the same query
 * code runs with or without row-level security.
 */
export type Executor = PgDatabase<PostgresJsQueryResultHKT>;

/** The role the policies are written for (migration 0002). It can read, never write. */
export const APP_ROLE = "rezen_app";

/** The setting the policies read: the school the current transaction is for. */
export const SCHOOL_SETTING = "app.school_id";

/**
 * Switches the current transaction to the restricted role and says which school it
 * is for. `set_config(..., true)` lasts until the transaction ends, so the pooled
 * connection goes back to the pool with neither the role nor the school (ADR-024).
 * `set_config('role', ...)` is `SET LOCAL ROLE`, but takes the school as a parameter.
 */
async function enterSchool(tx: Executor, schoolId: string): Promise<void> {
  await tx.execute(
    sql`select set_config('role', ${APP_ROLE}, true), set_config(${SCHOOL_SETTING}, ${schoolId}, true)`,
  );
}

/**
 * Runs `work` in a read-only transaction that Postgres limits to one school: the
 * policies show it only that school's rows, and it cannot write. Nothing in `work`
 * can widen this: the role has no way back to the owner's access.
 */
export function inSchool<T>(
  db: PostgresJsDatabase,
  schoolId: string,
  work: (tx: Executor) => Promise<T>,
): Promise<T> {
  return db.transaction(
    async (tx) => {
      await enterSchool(tx, schoolId);
      return work(tx);
    },
    { accessMode: "read only" },
  );
}

/**
 * Checks, at startup, that the restricted role exists and that the connected user
 * may switch to it, so a database without migration 0002 stops the server with a
 * message that says what to do, not on the first tool call.
 */
export async function verifyRowSecurity(database: Database): Promise<void> {
  try {
    await database.sql.begin("read only", async (tx) => {
      await tx`select set_config('role', ${APP_ROLE}, true)`;
    });
  } catch (error) {
    const code = findSqlError(error)?.code;
    if (code === "22023") {
      throw new DatabaseError(
        "no-app-role",
        `The database has no "${APP_ROLE}" role yet. Run "pnpm db:migrate" (or "pnpm pre-deploy") to create it.`,
        { cause: error },
      );
    }
    if (code === "42501") {
      throw new DatabaseError(
        "no-app-role",
        `The database user cannot switch to the "${APP_ROLE}" role. Run "pnpm db:migrate" as the user the app connects as, or grant that user the role.`,
        { cause: error },
      );
    }
    throw error;
  }
}
