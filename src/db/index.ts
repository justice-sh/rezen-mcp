import { ConfigError, type Config } from "../config/index.js";
import type { Database, DatabaseOptions } from "./database.js";
import { DockerDatabase } from "./docker-database.js";
import { LocalDatabase } from "./local-database.js";

export type { Database, DatabaseOptions, DbProvider } from "./database.js";
export { describeTarget } from "./database.js";
export { DatabaseError, findSqlError, notMigrated, type DatabaseErrorKind } from "./errors.js";
export { PostgresRepository } from "./postgres-repository.js";
export { MIGRATIONS_FOLDER, migrateDatabase } from "./migrate.js";
export { seedDatabase, type SeedResult, type SeedTableCounts } from "./seed.js";

/** Creates the database chosen by `DB_PROVIDER`, using the single `DATABASE_URL`. */
export function createDatabase(
  config: Pick<Config, "DATABASE_URL" | "DB_PROVIDER">,
  options?: DatabaseOptions,
): Database {
  const url = config.DATABASE_URL;
  if (url === undefined) {
    throw new ConfigError(
      "DATABASE_URL is not set. Copy .env.example to .env, or set it directly.",
    );
  }
  return config.DB_PROVIDER === "local"
    ? new LocalDatabase(url, options)
    : new DockerDatabase(url, options);
}
