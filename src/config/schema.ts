import { z } from "zod";
import { dbProviderSchema, parseUrlMap, postgresUrl } from "./database-url.js";

const databaseUrlSchema = z
  .preprocess(parseUrlMap, z.union([postgresUrl, z.partialRecord(dbProviderSchema, postgresUrl)]))
  .optional();

/**
 * Settings that used to exist and were removed (ADR-023). Setting one is an error,
 * not a silent no-op: a leftover `DATA_STORE=memory` in an env file would look like
 * it still chose a store, and a leftover `SCHOOL_ID` like it still chose a school.
 * Only the names are checked, and a message never contains the value.
 */
const REMOVED_SETTINGS = {
  DATA_STORE:
    "was removed: the server reads Postgres only (ADR-023). Delete it from your env files and environment.",
  SCHOOL_ID:
    'was removed: the school comes from SCHOOL_TOKEN (ADR-023). Delete it, and make a token with "pnpm db:token issue <schoolId>".',
} as const;

/**
 * Every environment variable the app reads is declared here. Add a variable to
 * this schema and it is validated and typed everywhere through `Config`.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // The one connection URL, whichever provider runs the server. Optional in the
    // schema so that tooling can load the config without it; whatever opens the
    // database stops with a hint when it is missing.
    // In the environment it is a postgres URL, or, outside production, a JSON map
    // of provider to URL. The transform below reduces it to the one URL for
    // DB_PROVIDER, so `Config.DATABASE_URL` is always a string (or unset).
    DATABASE_URL: databaseUrlSchema,

    // Which Postgres runs behind DATABASE_URL: a Docker container or one installed locally.
    DB_PROVIDER: dbProviderSchema.default("docker"),

    // Who is calling (ADR-022). The server needs a school token (made by
    // `pnpm db:token issue`) and learns its school from it. The server checks it at
    // startup, so it is optional here: other commands do not need it.
    SCHOOL_TOKEN: z.string().min(1).optional(),

    // Removed settings (see REMOVED_SETTINGS). Declared only so they can be refused.
    DATA_STORE: z.string().optional(),
    SCHOOL_ID: z.string().optional(),
  })
  .transform((env, ctx) => {
    const { DATA_STORE, SCHOOL_ID, ...kept } = env;
    const removedOk = checkRemoved({ DATA_STORE, SCHOOL_ID }, ctx);
    const dbUrl = getDatabaseUrl(kept, ctx);
    if (dbUrl === z.NEVER || !removedOk) return z.NEVER;

    return { ...kept, DATABASE_URL: dbUrl };
  });

export type Config = Readonly<z.infer<typeof envSchema>>;

function checkRemoved(
  env: Record<keyof typeof REMOVED_SETTINGS, string | undefined>,
  ctx: z.RefinementCtx,
): boolean {
  let ok = true;
  for (const name of Object.keys(REMOVED_SETTINGS) as (keyof typeof REMOVED_SETTINGS)[]) {
    if (env[name] === undefined) continue;
    ctx.addIssue({ code: "custom", path: [name], message: REMOVED_SETTINGS[name] });
    ok = false;
  }
  return ok;
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
