import type { Config } from "../config/index.js";
import { PostgresTokenStore, type TokenStore } from "../auth/token-store.js";
import {
  createDatabase,
  findSqlError,
  notMigrated,
  PostgresRepository,
  verifyRowSecurity,
} from "../db/index.js";
import type { Repository } from "./repository.js";

/** The repository the server reads from, and how to let go of what it holds. */
export interface DataStore {
  /**
   * A repository for one school, run by Postgres under row-level security: it cannot
   * see another school's rows, whatever it is asked (ADR-024). The only repository
   * the store hands out; the unrestricted one stays inside `openDataStore`.
   */
  repositoryFor(schoolId: string): Repository;
  /** Where school tokens are checked (ADR-020). */
  readonly tokens: TokenStore;
  /** Short and safe to log: names the store, never credentials. */
  readonly description: string;
  /** Releases what the store holds (the Postgres pool). Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Opens the data store: Postgres, through `DATABASE_URL` and `DB_PROVIDER`. It is
 * the only store (ADR-023).
 *
 * Postgres is checked up front, so a wrong URL, a database that was never
 * migrated and a database with no current term all stop the server at startup
 * with a message that says what to do, instead of failing on the first tool call.
 * The restricted role of row-level security is checked the same way (ADR-024).
 */
export async function openDataStore(
  config: Pick<Config, "DATABASE_URL" | "DB_PROVIDER">,
): Promise<DataStore> {
  const database = createDatabase(config);
  try {
    await database.check();
    await verifyReadable(new PostgresRepository(database));
    await verifyRowSecurity(database);
    return {
      repositoryFor: (schoolId) =>
        new PostgresRepository(database, { restrictedToSchool: schoolId }),
      tokens: new PostgresTokenStore(database),
      description: `${database.provider} Postgres at ${database.target}`,
      close: () => database.close(),
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}

/** Reads the current term, which also proves the tables exist and the data was seeded. */
async function verifyReadable(repository: Repository): Promise<void> {
  try {
    await repository.getCurrentTerm();
  } catch (error) {
    if (findSqlError(error)?.code === "42P01") throw notMigrated(error);
    throw error;
  }
}
