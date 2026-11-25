import { InMemoryRepository } from "../../src/data/repository.js";
import type { Dataset } from "../../src/data/types.js";
import { getConfig } from "../../src/config/index.js";
import { migrateDatabase, PostgresRepository, seedDatabase } from "../../src/db/index.js";
import type { ContractSubject } from "./repository-contract.js";
import { createTestDatabase, type TestDatabase } from "./test-database.js";

/** A throwaway database, migrated and seeded with `dataset`. */
export async function seededDatabase(dataset: Dataset): Promise<TestDatabase> {
  const db = await createTestDatabase();
  try {
    await migrateDatabase(db);
    await seedDatabase(db, dataset);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

/** A `PostgresRepository` over a seeded throwaway database; closing it drops the database. */
export async function openPostgresSubject(dataset: Dataset): Promise<ContractSubject> {
  const db = await seededDatabase(dataset);
  return { repo: new PostgresRepository(db), close: () => db.close() };
}

/** The in-memory repository for the same dataset. */
export async function openInMemorySubject(dataset: Dataset): Promise<ContractSubject> {
  return { repo: new InMemoryRepository(dataset), close: async () => {} };
}

/** The connection URL of a throwaway database (the test database's URL with its name). */
export function urlOf(db: TestDatabase): string {
  const base = getConfig().DATABASE_URL;
  if (base === undefined) throw new Error("DATABASE_URL is not set.");
  const url = new URL(base);
  url.pathname = `/${encodeURIComponent(db.name)}`;
  return url.toString();
}
