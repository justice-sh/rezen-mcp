import { ensureTestDatabase } from "../tests/support/test-database.js";

// Creates the default test database (for example rezen_mcp_test) if it is missing.
// Run through `pnpm test:db:setup`, which sets NODE_ENV=test.
try {
  const created = await ensureTestDatabase();
  console.log(created ? "Created the test database." : "The test database already exists.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
