import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  PostgresTokenStore,
  runTokenCommand,
  TokenError,
  UsageError,
} from "../src/auth/index.js";
import { DatabaseError, migrateDatabase, seedDatabase } from "../src/db/index.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

const SCHOOL_A = "sch_demo_a";
const SCHOOL_B = "sch_demo_b";

let db: TestDatabase;
let store: PostgresTokenStore;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrateDatabase(db);
  await seedDatabase(db);
  store = new PostgresTokenStore(db);
});

afterAll(async () => {
  await db?.close();
});

// Each test starts with no tokens. Only the tests do this.
beforeEach(async () => {
  await db.sql`truncate school_tokens`;
});

describe("issue", () => {
  it("returns a working token for the school, with its record", async () => {
    const issued = await store.issue(SCHOOL_A, { label: "demo" });
    expect(issued.token).toMatch(/^rzn_[A-Za-z0-9_-]{43}$/);
    expect(issued).toMatchObject({ schoolId: SCHOOL_A, label: "demo", revokedAt: null });
    expect(issued.createdAt).toBeInstanceOf(Date);
    // The result carries the token, the record's fields and nothing else: no hash.
    expect(Object.keys(issued).sort()).toEqual([
      "createdAt",
      "id",
      "label",
      "revokedAt",
      "schoolId",
      "token",
    ]);
    expect(await store.verify(issued.token)).toEqual({ tokenId: issued.id, schoolId: SCHOOL_A });
  });

  it("stores only the hash: the token appears nowhere in the table", async () => {
    const issued = await store.issue(SCHOOL_A);
    const rows = await db.sql<Record<string, unknown>[]>`select * from school_tokens`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(hashToken(issued.token));
    expect(JSON.stringify(rows)).not.toContain(issued.token);
  });

  it("gives each call a different token and id, and several tokens per school work together", async () => {
    const first = await store.issue(SCHOOL_A);
    const second = await store.issue(SCHOOL_A);
    expect(first.token).not.toBe(second.token);
    expect(first.id).not.toBe(second.id);
    expect((await store.verify(first.token))?.tokenId).toBe(first.id);
    expect((await store.verify(second.token))?.tokenId).toBe(second.id);
  });

  it("trims the label, and treats an empty one as none", async () => {
    expect((await store.issue(SCHOOL_A, { label: "  front desk  " })).label).toBe("front desk");
    expect((await store.issue(SCHOOL_A, { label: "   " })).label).toBeNull();
    expect((await store.issue(SCHOOL_A)).label).toBeNull();
  });

  it("refuses a label over 100 characters, and issues nothing", async () => {
    await expect(store.issue(SCHOOL_A, { label: "x".repeat(101) })).rejects.toMatchObject({
      constructor: TokenError,
      kind: "invalid-label",
    });
    expect(await store.list()).toEqual([]);
    expect((await store.issue(SCHOOL_A, { label: "x".repeat(100) })).label).toHaveLength(100);
  });

  it("refuses an unknown school with a message that has no token and no SQL", async () => {
    const error = await store.issue("sch_nope").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TokenError);
    expect(error).toMatchObject({ kind: "unknown-school" });
    expect((error as Error).message).toBe('There is no school with id "sch_nope".');
    expect(await store.list()).toEqual([]);
  });
});

describe("verify", () => {
  it("tells each school's tokens apart", async () => {
    const a = await store.issue(SCHOOL_A);
    const b = await store.issue(SCHOOL_B);
    expect((await store.verify(a.token))?.schoolId).toBe(SCHOOL_A);
    expect((await store.verify(b.token))?.schoolId).toBe(SCHOOL_B);
  });

  it("answers undefined, the same way, for an unknown, malformed or revoked token", async () => {
    const issued = await store.issue(SCHOOL_A);
    await store.revoke(issued.id);
    const answers = await Promise.all([
      store.verify(generateToken()), // well-formed, never issued
      store.verify("not a token"),
      store.verify(""),
      store.verify(issued.id), // the id is not the token
      store.verify(hashToken(issued.token)), // nor is the hash
      store.verify(issued.token), // revoked
    ]);
    expect(answers).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it("does not accept a token with a character changed", async () => {
    const issued = await store.issue(SCHOOL_A);
    const last = issued.token.at(-1);
    const changed = `${issued.token.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    expect(await store.verify(changed)).toBeUndefined();
    expect(await store.verify(issued.token)).toBeDefined();
  });
});

describe("revoke", () => {
  it("stops that token only, and keeps its row with the time", async () => {
    const keep = await store.issue(SCHOOL_A);
    const drop = await store.issue(SCHOOL_A);
    expect(await store.revoke(drop.id)).toBe(true);
    expect(await store.verify(drop.token)).toBeUndefined();
    expect((await store.verify(keep.token))?.tokenId).toBe(keep.id);
    const revoked = (await store.list()).find((record) => record.id === drop.id);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
  });

  it("is false for an unknown id and for a token already revoked, and keeps the first time", async () => {
    const issued = await store.issue(SCHOOL_A);
    expect(await store.revoke("no-such-id")).toBe(false);
    expect(await store.revoke(issued.id)).toBe(true);
    const [first] = await store.list();
    expect(await store.revoke(issued.id)).toBe(false);
    const [second] = await store.list();
    expect(second?.revokedAt).toEqual(first?.revokedAt);
  });
});

describe("list", () => {
  it("lists every token, revoked ones too, oldest first, never with a token or a hash", async () => {
    const first = await store.issue(SCHOOL_A, { label: "one" });
    const second = await store.issue(SCHOOL_B);
    await store.revoke(first.id);
    const records = await store.list();
    expect(records.map((record) => record.id)).toEqual([first.id, second.id]);
    expect(records[0]?.revokedAt).toBeInstanceOf(Date);
    expect(records[1]?.revokedAt).toBeNull();
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([
        "createdAt",
        "id",
        "label",
        "revokedAt",
        "schoolId",
      ]);
    }
  });

  it("can be limited to one school", async () => {
    await store.issue(SCHOOL_A);
    const b = await store.issue(SCHOOL_B);
    expect((await store.list(SCHOOL_B)).map((record) => record.id)).toEqual([b.id]);
    expect(await store.list("sch_nope")).toEqual([]);
  });
});

describe("a database that was never migrated", () => {
  it("says to run the migrations, for every operation", async () => {
    const bare = await createTestDatabase();
    try {
      const unmigrated = new PostgresTokenStore(bare);
      for (const run of [
        () => unmigrated.issue(SCHOOL_A),
        () => unmigrated.verify(generateToken()),
        () => unmigrated.revoke("x"),
        () => unmigrated.list(),
      ]) {
        await expect(run()).rejects.toMatchObject({
          constructor: DatabaseError,
          kind: "not-migrated",
        });
      }
    } finally {
      await bare.close();
    }
  });

  it("still answers a malformed token with undefined, without asking the database", async () => {
    const bare = await createTestDatabase();
    try {
      const unmigrated = new PostgresTokenStore(bare);
      await expect(unmigrated.verify("not a token")).resolves.toBeUndefined();
      await expect(unmigrated.verify("")).resolves.toBeUndefined();
    } finally {
      await bare.close();
    }
  });
});

describe("seeding", () => {
  it("never creates tokens, and running it again does not touch existing ones", async () => {
    expect(await store.list()).toEqual([]);
    const issued = await store.issue(SCHOOL_A);
    await seedDatabase(db);
    expect((await store.list()).map((record) => record.id)).toEqual([issued.id]);
    expect(await store.verify(issued.token)).toBeDefined();
  });
});

describe("runTokenCommand", () => {
  it("issues a token, shows it once with a warning, and the token works", async () => {
    const lines = await runTokenCommand(store, ["issue", SCHOOL_A, "--label", "demo"]);
    const output = lines.join("\n");
    const token = /token: (rzn_\S+)/.exec(output)?.[1];
    expect(token).toBeDefined();
    expect(output).toContain(`school ${SCHOOL_A}`);
    expect(output).toContain("shown once");
    expect(await store.verify(token ?? "")).toMatchObject({ schoolId: SCHOOL_A });
    expect((await store.list())[0]?.label).toBe("demo");
  });

  it("lists tokens without ever showing a token value, and filters by school", async () => {
    const a = await store.issue(SCHOOL_A, { label: "front desk" });
    const b = await store.issue(SCHOOL_B);
    const all = (await runTokenCommand(store, ["list"])).join("\n");
    expect(all).toContain(a.id);
    expect(all).toContain(b.id);
    expect(all).toContain('"front desk"');
    expect(all).not.toContain(a.token);
    expect(all).not.toContain(hashToken(a.token));
    const onlyB = (await runTokenCommand(store, ["list", "--school", SCHOOL_B])).join("\n");
    expect(onlyB).toContain(b.id);
    expect(onlyB).not.toContain(a.id);
    expect(await runTokenCommand(store, ["list", "--school", "sch_nope"])).toEqual(["No tokens."]);
  });

  it("shows revoked tokens as revoked", async () => {
    const issued = await store.issue(SCHOOL_A);
    await store.revoke(issued.id);
    expect((await runTokenCommand(store, ["list"])).join("\n")).toMatch(/revoked \d{4}-/);
  });

  it("revokes a token, and says so plainly when there is nothing to revoke", async () => {
    const issued = await store.issue(SCHOOL_A);
    expect(await runTokenCommand(store, ["revoke", issued.id])).toEqual([
      `Revoked token ${issued.id}.`,
    ]);
    expect((await runTokenCommand(store, ["revoke", issued.id]))[0]).toMatch(/No active token/);
    expect(await store.verify(issued.token)).toBeUndefined();
  });

  it("rejects a command typed wrongly, and changes nothing", async () => {
    for (const argv of [
      [],
      ["frobnicate"],
      ["issue"],
      ["issue", SCHOOL_A, "extra"],
      ["issue", SCHOOL_A, "--school", SCHOOL_B],
      ["list", "extra"],
      ["list", "--label", "x"],
      ["revoke"],
      ["revoke", "a", "b"],
      ["revoke", "a", "--label", "x"],
      ["issue", SCHOOL_A, "--nope"],
      ["issue", SCHOOL_A, "--label"],
    ]) {
      await expect(runTokenCommand(store, argv), JSON.stringify(argv)).rejects.toBeInstanceOf(
        UsageError,
      );
    }
    expect(await store.list()).toEqual([]);
  });

  it("lets a store error through, such as an unknown school", async () => {
    await expect(runTokenCommand(store, ["issue", "sch_nope"])).rejects.toBeInstanceOf(TokenError);
  });
});
