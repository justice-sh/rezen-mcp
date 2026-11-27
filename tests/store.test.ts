import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, getConfig } from "../src/config/index.js";
import { openDataStore, type DataStore } from "../src/data/store.js";
import { DatabaseError, PostgresRepository } from "../src/db/index.js";
import { edgeCaseDataset } from "./fixtures.js";
import { seededDatabase, urlOf } from "./support/postgres-subject.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

describe("openDataStore", () => {
  const databases: TestDatabase[] = [];
  const stores: DataStore[] = [];

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
    await Promise.all(databases.splice(0).map((db) => db.close()));
  });

  const track = async (db: Promise<TestDatabase>) => {
    const created = await db;
    databases.push(created);
    return created;
  };

  const postgresConfig = (db: TestDatabase) => ({
    DATABASE_URL: urlOf(db),
    DB_PROVIDER: getConfig().DB_PROVIDER,
  });

  it("gives a Postgres repository and a token store, and a description without credentials", async () => {
    const db = await track(seededDatabase(edgeCaseDataset()));
    const config = postgresConfig(db);
    const store = await openDataStore(config);
    stores.push(store);

    expect(store.repository).toBeInstanceOf(PostgresRepository);
    expect(store.tokens).toBeDefined();
    expect(await store.repository.getCurrentTerm()).toBe("2026-T2");
    expect(store.description).toContain(db.name);
    // A URL would carry the user and password before an "@".
    expect(store.description).not.toContain("@");
    expect(store.description).not.toContain("://");
  });

  it("stops with a hint when DATABASE_URL is not set", async () => {
    await expect(openDataStore({ DATABASE_URL: undefined, DB_PROVIDER: "docker" })).rejects.toThrow(
      ConfigError,
    );
  });

  it("stops with a hint when the server cannot be reached", async () => {
    const error = await openDataStore({
      DATABASE_URL: "postgresql://rezen:s3cret-pass@127.0.0.1:1/rezen_mcp_test",
      DB_PROVIDER: "docker",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).kind).toBe("unreachable");
    expect((error as DatabaseError).message).not.toContain("s3cret-pass");
  });

  it("stops and says to migrate when the database has no tables", async () => {
    const db = await track(createTestDatabase());
    const error = await openDataStore(postgresConfig(db)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).kind).toBe("not-migrated");
    expect((error as DatabaseError).message).toContain("pnpm db:migrate");
  });

  it("stops and says to seed when the database has no current term", async () => {
    const db = await track(seededDatabase(edgeCaseDataset()));
    await db.sql`update terms set is_current = false`;
    const error = await openDataStore(postgresConfig(db)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).kind).toBe("no-current-term");
  });

  it("closes the connection pool, and closing twice is harmless", async () => {
    const db = await track(seededDatabase(edgeCaseDataset()));
    const store = await openDataStore(postgresConfig(db));
    await store.close();
    await store.close();
    await expect(store.repository.listTerms()).rejects.toThrow();
  });
});
