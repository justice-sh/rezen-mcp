import type { Config } from "../config/index.js";
import { PostgresTokenStore, type TokenStore } from "../auth/token-store.js";
import { createDatabase, findSqlError, notMigrated, PostgresRepository } from "../db/index.js";
import { createInMemoryRepository, type Repository } from "./repository.js";

/** The repository the server reads from, and how to let go of what it holds. */
export interface DataStore {
  readonly repository: Repository;
  /** Where school tokens are checked. Only Postgres has them; the in-memory store has none (ADR-022). */
  readonly tokens: TokenStore | undefined;
  /** Short and safe to log: names the store, never credentials. */
  readonly description: string;
  /** Releases what the store holds (the Postgres pool). Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Opens the data store chosen by `DATA_STORE` (ADR-019): the in-memory synthetic
 * dataset (the default), or Postgres through `DATABASE_URL` and `DB_PROVIDER`.
 *
 * Postgres is checked up front, so a wrong URL, a database that was never
 * migrated and a database with no current term all stop the server at startup
 * with a message that says what to do, instead of failing on the first tool call.
 */
export async function openDataStore(
  config: Pick<Config, "DATA_STORE" | "DATABASE_URL" | "DB_PROVIDER">,
): Promise<DataStore> {
  if (config.DATA_STORE === "memory") {
    return {
      repository: createInMemoryRepository(),
      tokens: undefined,
      description: "in-memory synthetic data",
      close: async () => {},
    };
  }

  const database = createDatabase(config);
  try {
    await database.check();
    const repository = new PostgresRepository(database);
    await verifyReadable(repository);
    return {
      repository,
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
