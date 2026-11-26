import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/index.js";
import { openDataStore, type DataStore } from "../src/data/store.js";
import { DatabaseError, PostgresRepository } from "../src/db/index.js";
import { InMemoryRepository } from "../src/data/repository.js";
import { getConfig } from "../src/config/index.js";
import { edgeCaseDataset } from "./fixtures.js";
import { seededDatabase, urlOf } from "./support/postgres-subject.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

const settings = (env: Record<string, string>) =>
  loadConfig({ cwd: "/nonexistent-rezen-dir", env });

describe("DATA_STORE in the config", () => {
  it("defaults to memory, and accepts memory and postgres", () => {
    expect(settings({}).DATA_STORE).toBe("memory");
    expect(settings({ DATA_STORE: "memory" }).DATA_STORE).toBe("memory");
    expect(settings({ DATA_STORE: "postgres" }).DATA_STORE).toBe("postgres");
  });

  it("rejects any other value, and says which variable", () => {
    expect(() => settings({ DATA_STORE: "sqlite" })).toThrow(/DATA_STORE/);
  });
});

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
    DATA_STORE: "postgres" as const,
    DATABASE_URL: urlOf(db),
    DB_PROVIDER: getConfig().DB_PROVIDER,
  });

  it("gives the in-memory repository for memory, with no database and no URL", async () => {
    const store = await openDataStore(settings({}));
    stores.push(store);
    expect(store.repository).toBeInstanceOf(InMemoryRepository);
    expect(store.description).toContain("in-memory");
    expect(store.tokens).toBeUndefined();
    expect(await store.repository.getCurrentTerm()).toBe("2026-T2");
  });

  it("gives a Postgres repository for postgres, and a description without credentials", async () => {
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

  it("stops with a hint when postgres is chosen but DATABASE_URL is not set", async () => {
    await expect(
      openDataStore({ DATA_STORE: "postgres", DATABASE_URL: undefined, DB_PROVIDER: "docker" }),
    ).rejects.toThrow(ConfigError);
  });

  it("stops with a hint when the server cannot be reached", async () => {
    const error = await openDataStore({
      DATA_STORE: "postgres",
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
