import { defineConfig } from "drizzle-kit";

// Used by `pnpm db:generate` only, which reads the schema and writes SQL; it never
// connects to a database. Applying migrations is `pnpm db:migrate`, which goes
// through src/db so it uses the layered config and the provider hints (ADR-016).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
