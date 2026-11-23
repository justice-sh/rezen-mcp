import { randomBytes } from "node:crypto";
import { getConfig, type Config } from "../../src/config/index.js";
import {
  createDatabase,
  DatabaseError,
  describeTarget,
  type Database,
  type DatabaseOptions,
} from "../../src/db/index.js";

/** What the test database helpers need from the config. */
export type TestConfig = Pick<Config, "NODE_ENV" | "DATABASE_URL" | "DB_PROVIDER">;

/** A throwaway database, created for one test file and dropped when it closes. */
export interface TestDatabase extends Database {
  readonly name: string;
}

const SUFFIX = /^[0-9a-f]{8}$/;

function notTestMode(message: string): DatabaseError {
  return new DatabaseError("not-test-mode", message);
}

/**
 * Refuses to go further unless this is clearly a test run against a test
 * database: NODE_ENV must be "test" and the database name must contain "test".
 * This is what stops a test (or a cleanup script) from touching real data.
 */
export function assertTestMode(config: TestConfig): { url: URL; baseName: string } {
  if (config.NODE_ENV !== "test") {
    throw notTestMode(
      `Refusing to touch a database: NODE_ENV is "${config.NODE_ENV}", not "test". Run tests with "pnpm test", which sets NODE_ENV=test.`,
    );
  }
  if (config.DATABASE_URL === undefined) {
    throw notTestMode(
      "DATABASE_URL is not set. For tests, set it in .env.test (see .env.example) or in your CI environment.",
    );
  }
  describeTarget(config.DATABASE_URL); // throws, without echoing the URL, when it is invalid
  const url = new URL(config.DATABASE_URL);
  const baseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/test/i.test(baseName)) {
    throw notTestMode(
      `Refusing to use database "${baseName}": the name of a test database must contain "test". Set DATABASE_URL in .env.test (see .env.example).`,
    );
  }
  return { url, baseName };
}

function withDatabase(url: URL, name: string): string {
  const copy = new URL(url);
  copy.pathname = `/${encodeURIComponent(name)}`;
  return copy.toString();
}

/** A connection to the server's maintenance database, used to create and drop databases. */
function maintenanceDatabase(url: URL, provider: TestConfig["DB_PROVIDER"]): Database {
  return createDatabase(
    { DATABASE_URL: withDatabase(url, "postgres"), DB_PROVIDER: provider },
    { max: 1 },
  );
}

async function checkWithHint(database: Database): Promise<void> {
  try {
    await database.check();
  } catch (error) {
    if (error instanceof DatabaseError && /does not exist/.test(error.message)) {
      throw new DatabaseError("rejected", `${error.message} Create it with "pnpm test:db:setup".`, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Creates a fresh database named `<test database>_<random>` on the same server,
 * and returns a connection to it. Every call gets its own database, so test
 * files can run in parallel. `close()` closes the pool and drops the database.
 */
export async function createTestDatabase(
  config: TestConfig = getConfig(),
  options?: DatabaseOptions,
): Promise<TestDatabase> {
  const { url, baseName } = assertTestMode(config);
  const admin = createDatabase(config, { max: 1 });
  const name = `${baseName}_${randomBytes(4).toString("hex")}`;

  try {
    await checkWithHint(admin);
    await admin.sql`create database ${admin.sql(name)}`;
  } catch (error) {
    await admin.close();
    throw error;
  }

  const database = createDatabase(
    { DATABASE_URL: withDatabase(url, name), DB_PROVIDER: config.DB_PROVIDER },
    options,
  );

  let closed = false;
  return {
    name,
    provider: database.provider,
    target: database.target,
    sql: database.sql,
    check: () => database.check(),
    async close() {
      if (closed) return;
      closed = true;
      try {
        await database.close();
        await admin.sql`drop database if exists ${admin.sql(name)} with (force)`;
      } finally {
        await admin.close();
      }
    },
  };
}

/**
 * Drops every test database: leftovers of the exact form `<test database>_<8 hex
 * characters>`, then the base test database itself. Nothing else is touched.
 * Returns the names dropped. `pnpm test` recreates the base database.
 */
export async function purgeTestDatabases(config: TestConfig = getConfig()): Promise<string[]> {
  const { url, baseName } = assertTestMode(config);
  // The base database cannot be dropped while connected to it, so use the maintenance database.
  const maintenance = maintenanceDatabase(url, config.DB_PROVIDER);
  try {
    const rows = await maintenance.sql<{ datname: string }[]>`
      select datname from pg_database
      where datname = ${baseName} or starts_with(datname, ${`${baseName}_`})`;
    const names = rows.map((row) => row.datname);
    const dropped = [
      ...names.filter((name) => SUFFIX.test(name.slice(baseName.length + 1)) && name !== baseName),
      ...names.filter((name) => name === baseName),
    ];
    for (const name of dropped) {
      await maintenance.sql`drop database if exists ${maintenance.sql(name)} with (force)`;
    }
    return dropped;
  } finally {
    await maintenance.close();
  }
}

/** Creates the test database itself if it does not exist yet. Returns true if it was created. */
export async function ensureTestDatabase(config: TestConfig = getConfig()): Promise<boolean> {
  const { url, baseName } = assertTestMode(config);
  const maintenance = maintenanceDatabase(url, config.DB_PROVIDER);
  try {
    await maintenance.check();
    const rows = await maintenance.sql`select 1 from pg_database where datname = ${baseName}`;
    if (rows.length > 0) return false;
    await maintenance.sql`create database ${maintenance.sql(baseName)}`;
    return true;
  } finally {
    await maintenance.close();
  }
}
