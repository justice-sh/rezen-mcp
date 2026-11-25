import { getConfig } from "../src/config/index.js";
import { createDatabase, migrateDatabase, type Database } from "../src/db/index.js";

// Applies the migrations in drizzle/ to the database the app would use.
let database: Database | undefined;
try {
  database = createDatabase(getConfig());
  await migrateDatabase(database);
  console.log(`Migrations applied: ${database.provider} Postgres at ${database.target}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database?.close();
}
