import { z } from "zod";
import { dbProviderSchema, parseUrlMap, postgresUrl } from "./database-url.js";

const databaseUrlSchema = z
  .preprocess(parseUrlMap, z.union([postgresUrl, z.partialRecord(dbProviderSchema, postgresUrl)]))
  .optional();

/**
 * Every environment variable the app reads is declared here. Add a variable to
 * this schema and it is validated and typed everywhere through `Config`.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // The one connection URL, whichever provider runs the server. Optional until
    // something needs it (the in-memory repository works without a database).
    // In the environment it is a postgres URL, or, outside production, a JSON map
    // of provider to URL. The transform below reduces it to the one URL for
    // DB_PROVIDER, so `Config.DATABASE_URL` is always a string (or unset).
    DATABASE_URL: databaseUrlSchema,

    // Which Postgres runs behind DATABASE_URL: a Docker container or one installed locally.
    DB_PROVIDER: dbProviderSchema.default("docker"),
  })
  .transform((env, ctx) => {
    const dbUrl = getDatabaseUrl(env, ctx);
    if (dbUrl === z.NEVER) return z.NEVER;

    return { ...env, DATABASE_URL: dbUrl };
  });

export type Config = Readonly<z.infer<typeof envSchema>>;

function getDatabaseUrl(
  env: Omit<z.infer<typeof envSchema>, "DATABASE_URL"> & {
    DATABASE_URL?: z.infer<typeof databaseUrlSchema>;
  },
  ctx: z.RefinementCtx,
): string | undefined | typeof z.NEVER {
  const { DATABASE_URL: setting } = env;

  if (setting === undefined || typeof setting === "string") return setting;

  // The map form: development and test only, and it must cover the chosen provider.
  if (env.NODE_ENV === "production") {
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message: "must be a single URL in production, not a map of providers to URLs.",
    });
    return z.NEVER;
  }

  const url = setting[env.DB_PROVIDER];
  if (url === undefined) {
    const has = Object.keys(setting).join(", ") || "none";
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message: `has no URL for DB_PROVIDER="${env.DB_PROVIDER}" (it has: ${has}). Add one, or change DB_PROVIDER.`,
    });
    return z.NEVER;
  }

  return url;
}
