import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Creating and dropping databases takes a second or more on some setups
    // (for example a local Postgres on Windows), and some tests create several.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
