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

    // Where the server reads its data from: the in-memory synthetic dataset or Postgres
    // (which needs DATABASE_URL, a migrated and seeded database; see ADR-019).
    DATA_STORE: z.enum(["memory", "postgres"]).default("memory"),

    // Who is calling (ADR-022). With DATA_STORE=postgres the server needs a school token
    // (made by `pnpm db:token issue`) and learns its school from it. The in-memory store
    // has no tokens, so there SCHOOL_ID picks the school (default: the first demo school).
    // The checks below reject the combination that would be ignored.
    SCHOOL_TOKEN: z.string().min(1).optional(),
    SCHOOL_ID: z.string().min(1).optional(),
  })
  .transform((env, ctx) => {
    const dbUrl = getDatabaseUrl(env, ctx);
    const identityOk = checkIdentity(env, ctx);
    if (dbUrl === z.NEVER || !identityOk) return z.NEVER;

    return { ...env, DATABASE_URL: dbUrl };
  });

export type Config = Readonly<z.infer<typeof envSchema>>;

/**
 * A setting that would be ignored is an error, not a silent no-op: a token that
 * does nothing looks like protection that is not there. Messages never contain the token.
 */
function checkIdentity(
  env: {
    DATA_STORE: "memory" | "postgres";
    SCHOOL_TOKEN?: string | undefined;
    SCHOOL_ID?: string | undefined;
  },
  ctx: z.RefinementCtx,
): boolean {
  if (env.DATA_STORE === "memory" && env.SCHOOL_TOKEN !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["SCHOOL_TOKEN"],
      message:
        "has no effect with DATA_STORE=memory, which has no tokens. Remove it, or use DATA_STORE=postgres.",
    });
    return false;
  }
  if (env.DATA_STORE === "postgres" && env.SCHOOL_ID !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["SCHOOL_ID"],
      message:
        "only applies with DATA_STORE=memory. With postgres the school comes from SCHOOL_TOKEN; remove SCHOOL_ID.",
    });
    return false;
  }
  return true;
}

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
