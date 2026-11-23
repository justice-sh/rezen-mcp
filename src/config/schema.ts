import { z } from "zod";

/**
 * Every environment variable the app reads is declared here. Add a variable to
 * this schema and it is validated and typed everywhere through `Config`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // The one connection URL, whichever provider runs the server. Optional until
  // something needs it (the in-memory repository works without a database).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),

  // Which Postgres runs behind DATABASE_URL: a Docker container or one installed locally.
  DB_PROVIDER: z.enum(["docker", "local"]).default("docker"),
});

export type Config = Readonly<z.infer<typeof envSchema>>;
