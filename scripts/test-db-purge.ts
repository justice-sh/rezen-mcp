import { purgeTestDatabases } from "../tests/support/test-database.js";

// Drops the throwaway test databases and the base test database (`pnpm test` recreates it).
// Run through `pnpm test:db:purge`, which sets NODE_ENV=test.
try {
  const dropped = await purgeTestDatabases();
  console.log(
    dropped.length === 0
      ? "No test databases to drop."
      : `Dropped ${dropped.length}: ${dropped.join(", ")}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
