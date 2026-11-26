import { PostgresTokenStore, runTokenCommand, TOKEN_USAGE, UsageError } from "../src/auth/index.js";
import { getConfig } from "../src/config/index.js";
import { createDatabase, type Database } from "../src/db/index.js";

// Issues, lists and revokes per-school tokens in the database the app would use
// (run `pnpm db:migrate` first). Seeding never creates tokens (ADR-020).
let database: Database | undefined;
try {
  database = createDatabase(getConfig());
  const store = new PostgresTokenStore(database);
  for (const line of await runTokenCommand(store, process.argv.slice(2))) console.log(line);
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${TOKEN_USAGE}`);
    process.exitCode = 2;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} finally {
  await database?.close();
}
