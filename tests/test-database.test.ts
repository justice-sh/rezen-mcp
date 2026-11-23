import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "../src/config/index.js";
import { DatabaseError } from "../src/db/index.js";
import {
  assertTestMode,
  createTestDatabase,
  ensureTestDatabase,
  purgeTestDatabases,
  type TestConfig,
  type TestDatabase,
} from "./support/test-database.js";

const opened: TestDatabase[] = [];
const scratch: { via: TestDatabase; name: string }[] = [];

/** Creates an extra database for a test and makes sure it is dropped afterwards, pass or fail. */
async function createScratch(via: TestDatabase, name: string): Promise<void> {
  scratch.push({ via, name });
  await via.sql`create database ${via.sql(name)}`;
}

async function open(config?: TestConfig): Promise<TestDatabase> {
  const database = await createTestDatabase(config);
  opened.push(database);
  return database;
}

afterEach(async () => {
  for (const { via, name } of scratch.splice(0)) {
    await via.sql`drop database if exists ${via.sql(name)} with (force)`;
  }
  await Promise.all(opened.splice(0).map((database) => database.close()));
});

const SAFE: TestConfig = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://rezen:rezen@localhost:15432/rezen_mcp_test",
  DB_PROVIDER: "docker",
};

/** A config whose "test database" is the given throwaway database, so a test cannot touch others. */
function configFor(name: string): TestConfig {
  const base = getConfig();
  const url = new URL(base.DATABASE_URL ?? "");
  url.pathname = `/${name}`;
  return { NODE_ENV: "test", DATABASE_URL: url.toString(), DB_PROVIDER: base.DB_PROVIDER };
}

async function databaseExists(via: TestDatabase, name: string): Promise<boolean> {
  const rows = await via.sql`select 1 from pg_database where datname = ${name}`;
  return rows.length > 0;
}

describe("assertTestMode (no database needed)", () => {
  it("accepts NODE_ENV=test with a database whose name contains test", () => {
    expect(assertTestMode(SAFE).baseName).toBe("rezen_mcp_test");
  });

  it("refuses outside NODE_ENV=test", () => {
    for (const NODE_ENV of ["development", "production"] as const) {
      const act = () => assertTestMode({ ...SAFE, NODE_ENV });
      expect(act).toThrow(DatabaseError);
      expect(act).toThrow(/NODE_ENV/);
    }
  });

  it("refuses a database whose name does not contain test", () => {
    const act = () =>
      assertTestMode({
        ...SAFE,
        DATABASE_URL: "postgresql://rezen:rezen@localhost:15432/rezen_mcp",
      });
    expect(act).toThrow(/must contain "test"/);
    expect(act).toThrow(/\.env\.test/);
  });

  it("refuses a missing or invalid URL without echoing it", () => {
    expect(() => assertTestMode({ ...SAFE, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL is not set/,
    );
    const act = () => assertTestMode({ ...SAFE, DATABASE_URL: "nonsense-s3cret-test" });
    expect(act).toThrow(DatabaseError);
    expect(act).not.toThrow(/s3cret/);
  });

  it("stops every helper before any connection is made", async () => {
    const unsafe: TestConfig = { ...SAFE, NODE_ENV: "development" };
    await expect(createTestDatabase(unsafe)).rejects.toMatchObject({ kind: "not-test-mode" });
    await expect(purgeTestDatabases(unsafe)).rejects.toMatchObject({ kind: "not-test-mode" });
    await expect(ensureTestDatabase(unsafe)).rejects.toMatchObject({ kind: "not-test-mode" });
  });
});

describe("createTestDatabase", () => {
  it("gives each call its own database, named after the test database", async () => {
    const [a, b] = await Promise.all([open(), open()]);
    expect(a.name).not.toBe(b.name);
    expect(a.name).toMatch(/^.*test_[0-9a-f]{8}$/);
    const rows = await a.sql<{ name: string }[]>`select current_database() as name`;
    expect(rows[0]?.name).toBe(a.name);
  });

  it("keeps databases isolated, even when many are created at once", async () => {
    const databases = await Promise.all(Array.from({ length: 5 }, () => open()));
    expect(new Set(databases.map((database) => database.name)).size).toBe(5);

    await Promise.all(
      databases.map((database, index) =>
        database.sql`create table marker (n int)`.then(
          () => database.sql`insert into marker values (${index})`,
        ),
      ),
    );
    const counts = await Promise.all(
      databases.map((database) => database.sql<{ n: number }[]>`select n from marker`),
    );
    counts.forEach((rows, index) => expect(rows.map((row) => row.n)).toEqual([index]));
  });

  it("drops its database on close, and closing twice is harmless", async () => {
    const keeper = await open();
    const temporary = await createTestDatabase();
    expect(await databaseExists(keeper, temporary.name)).toBe(true);
    await temporary.close();
    expect(await databaseExists(keeper, temporary.name)).toBe(false);
    await expect(temporary.close()).resolves.toBeUndefined();
  });

  it("reports an unreachable server instead of hanging", async () => {
    await expect(
      createTestDatabase({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://rezen:rezen@127.0.0.1:1/rezen_mcp_test",
        DB_PROVIDER: "docker",
      }),
    ).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("says how to create the test database when it is missing", async () => {
    const keeper = await open();
    await expect(createTestDatabase(configFor(`${keeper.name}_ffffffff`))).rejects.toThrow(
      /pnpm test:db:setup/,
    );
  });
});

describe("purgeTestDatabases", () => {
  // Each test purges its own "base", a throwaway name, so other test files are untouched.
  async function withBase(): Promise<{ scope: TestDatabase; root: string }> {
    const scope = await open();
    return { scope, root: `${scope.name}_0badf00d` };
  }

  it("drops leftovers of the exact form, then the base database, and nothing else", async () => {
    const { scope, root } = await withBase();
    const leftover = `${root}_deadbeef`;
    const keepers = [`${root}_deadbeef0`, `${root}_notahex1`, `${root}x_deadbeef`];
    for (const name of [root, leftover, ...keepers]) await createScratch(scope, name);

    const dropped = await purgeTestDatabases(configFor(root));

    expect(dropped).toEqual([leftover, root]);
    expect(await databaseExists(scope, leftover)).toBe(false);
    expect(await databaseExists(scope, root)).toBe(false);
    for (const name of keepers) expect(await databaseExists(scope, name)).toBe(true);
  });

  it("drops databases that still have open connections", async () => {
    const { scope, root } = await withBase();
    await createScratch(scope, root);
    const child = await createTestDatabase(configFor(root));
    scratch.push({ via: scope, name: child.name });
    await child.sql`select 1`;

    const dropped = await purgeTestDatabases(configFor(root));

    expect(dropped).toEqual([child.name, root]);
    expect(await databaseExists(scope, child.name)).toBe(false);
    await child.sql.end({ timeout: 1 });
  });

  it("drops leftovers even when the base database is already gone", async () => {
    const { scope, root } = await withBase();
    const leftover = `${root}_deadbeef`;
    await createScratch(scope, leftover);
    expect(await purgeTestDatabases(configFor(root))).toEqual([leftover]);
    expect(await databaseExists(scope, leftover)).toBe(false);
  });

  it("reports nothing to do when there is nothing to drop", async () => {
    const { root } = await withBase();
    expect(await purgeTestDatabases(configFor(root))).toEqual([]);
  });
});

describe("ensureTestDatabase", () => {
  it("creates a missing test database once, then leaves it alone", async () => {
    const scope = await open();
    const target = `${scope.name}_0000abcd`;
    scratch.push({ via: scope, name: target });
    expect(await ensureTestDatabase(configFor(target))).toBe(true);
    expect(await databaseExists(scope, target)).toBe(true);
    expect(await ensureTestDatabase(configFor(target))).toBe(false);
  });
});
