import { z } from "zod";

/**
 * Every environment variable the app reads is declared here. Add a variable to
 * this schema and it is validated and typed everywhere through `Config`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = Readonly<z.infer<typeof envSchema>>;
