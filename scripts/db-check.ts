import { getConfig } from "../src/config/index.js";
import { createDatabase, type Database } from "../src/db/index.js";

// Prints which database the app would use and whether it answers.
let database: Database | undefined;
try {
  database = createDatabase(getConfig());
  await database.check();
  console.log(`OK: ${database.provider} Postgres at ${database.target}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database?.close();
}
