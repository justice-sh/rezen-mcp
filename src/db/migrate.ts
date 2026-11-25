import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./database.js";

/**
 * The generated migrations (`pnpm db:generate`). From `src/db` and from `dist/db`
 * this resolves to the same place: `drizzle/` at the repository root.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Applies every migration that has not run yet. Safe to repeat: applied ones
 * are recorded and skipped. `check()` runs first so an unreachable server gives
 * the provider's hint instead of a raw connection error.
 */
export async function migrateDatabase(database: Database): Promise<void> {
  await database.check();
  await migrate(drizzle(database.sql), { migrationsFolder: MIGRATIONS_FOLDER });
}
