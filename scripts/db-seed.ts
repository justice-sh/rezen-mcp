import { getConfig } from "../src/config/index.js";
import { createDatabase, seedDatabase, type Database } from "../src/db/index.js";

// Inserts the synthetic dataset into the database the app would use (run
// `pnpm db:migrate` first). Safe to repeat: existing rows are left alone.
let database: Database | undefined;
try {
  database = createDatabase(getConfig());
  const result = await seedDatabase(database);
  console.log(`Seeded ${database.provider} Postgres at ${database.target}:`);
  for (const table of ["schools", "classes", "students", "subjects", "terms", "scores"] as const) {
    const { inserted, skipped } = result[table];
    console.log(`  ${table}: ${inserted} inserted, ${skipped} already there`);
  }
  if (result.currentTermSet) console.log("  current term: set");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database?.close();
}
