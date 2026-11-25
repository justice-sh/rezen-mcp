import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  DatabaseError,
  MIGRATIONS_FOLDER,
  migrateDatabase,
} from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrateDatabase(db);
  // Two schools, each with one class and one student, two subjects and two terms.
  // The second term is the current one.
  await db.sql`insert into schools (id, name) values ('sch_a', 'School A'), ('sch_b', 'School B')`;
  await db.sql`insert into classes (id, school_id, name, level) values
    ('sch_a_c1', 'sch_a', 'Primary 1', 1), ('sch_b_c1', 'sch_b', 'Primary 1', 1)`;
  await db.sql`insert into students (id, class_id, school_id, name) values
    ('sch_a_c1_s1', 'sch_a_c1', 'sch_a', 'Ada Okoro'), ('sch_b_c1_s1', 'sch_b_c1', 'sch_b', 'Tobi Bello')`;
  await db.sql`insert into subjects (name, position) values ('Mathematics', 1), ('English', 2)`;
  await db.sql`insert into terms (id, position, is_current) values ('2026-T1', 1, false), ('2026-T2', 2, true)`;
});

afterAll(async () => {
  await db?.close();
});

/** Asserts that a statement fails with the given Postgres error code (SQLSTATE). */
async function expectSqlState(run: () => PromiseLike<unknown>, code: string): Promise<void> {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toMatchObject({ code });
}

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

const TABLES = [
  schema.schools,
  schema.classes,
  schema.students,
  schema.subjects,
  schema.terms,
  schema.scores,
];

describe("migrations", () => {
  it("create exactly the tables the schema declares", async () => {
    const rows = await db.sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;
    expect(rows.map((row) => row.table_name).sort()).toEqual(
      TABLES.map((table) => getTableConfig(table).name).sort(),
    );
  });

  it("create the columns, and nullability, that src/db/schema.ts declares", async () => {
    for (const table of TABLES) {
      const config = getTableConfig(table);
      const rows = await db.sql<{ column_name: string; is_nullable: string }[]>`
        select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = ${config.name}`;
      const actual = Object.fromEntries(rows.map((row) => [row.column_name, row.is_nullable]));
      const expected = Object.fromEntries(
        config.columns.map((column) => [column.name, column.notNull ? "NO" : "YES"]),
      );
      expect(actual, `table ${config.name}`).toEqual(expected);
    }
  });

  it("can be applied again without effect, and every migration is recorded", async () => {
    const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8")) as {
      entries: unknown[];
    };
    const count = async () => {
      const [row] = await db.sql<{ n: number }[]>`
        select count(*)::int as n from drizzle.__drizzle_migrations`;
      return row?.n;
    };
    expect(await count()).toBe(journal.entries.length);
    await migrateDatabase(db);
    expect(await count()).toBe(journal.entries.length);
  });

  it("fail with the provider's hint when the server cannot be reached", async () => {
    // Port 1 refuses connections at once, so this needs no server.
    const unreachable = createDatabase({
      DATABASE_URL: "postgresql://rezen:rezen@127.0.0.1:1/rezen_mcp_test",
      DB_PROVIDER: "docker",
    });
    try {
      await expect(migrateDatabase(unreachable)).rejects.toMatchObject({
        constructor: DatabaseError,
        kind: "unreachable",
      });
    } finally {
      await unreachable.close();
    }
  });
});

describe("score constraints", () => {
  const insert = (ca: number | null, exam: number | null, subject = "Mathematics") =>
    db.sql`insert into scores (student_id, school_id, subject, term, ca, exam)
      values ('sch_a_c1_s1', 'sch_a', ${subject}, '2026-T1', ${ca}, ${exam})`;

  it("accept the full range, and null for a component not yet entered", async () => {
    await insert(40, 60, "Mathematics");
    await insert(null, 0, "English");
    await db.sql`delete from scores where student_id = 'sch_a_c1_s1'`;
  });

  it("reject a CA score above 40 or below 0", async () => {
    await expectSqlState(() => insert(41, 10), CHECK_VIOLATION);
    await expectSqlState(() => insert(-1, 10), CHECK_VIOLATION);
  });

  it("reject an exam score above 60 or below 0", async () => {
    await expectSqlState(() => insert(10, 61), CHECK_VIOLATION);
    await expectSqlState(() => insert(10, -1), CHECK_VIOLATION);
  });

  it("allow one entry per student, subject and term", async () => {
    await insert(10, 10);
    try {
      await expectSqlState(() => insert(20, 20), UNIQUE_VIOLATION);
    } finally {
      await db.sql`delete from scores where student_id = 'sch_a_c1_s1'`;
    }
  });

  it("reject an unknown subject or term", async () => {
    await expectSqlState(() => insert(10, 10, "Underwater Basket Weaving"), FOREIGN_KEY_VIOLATION);
    await expectSqlState(
      () => db.sql`insert into scores (student_id, school_id, subject, term, ca, exam)
        values ('sch_a_c1_s1', 'sch_a', 'Mathematics', '1999-T9', 10, 10)`,
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe("school consistency", () => {
  it("rejects a student whose school differs from its class's school", async () => {
    await expectSqlState(
      () => db.sql`insert into students (id, class_id, school_id, name)
        values ('sch_x_s1', 'sch_a_c1', 'sch_b', 'Misfiled Student')`,
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("rejects a score whose school differs from its student's school", async () => {
    await expectSqlState(
      () => db.sql`insert into scores (student_id, school_id, subject, term, ca, exam)
        values ('sch_a_c1_s1', 'sch_b', 'Mathematics', '2026-T1', 10, 10)`,
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("rejects a class for a school that does not exist", async () => {
    await expectSqlState(
      () => db.sql`insert into classes (id, school_id, name, level)
        values ('sch_z_c1', 'sch_z', 'Primary 1', 1)`,
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe("terms and subjects", () => {
  it("allow at most one current term", async () => {
    await expectSqlState(
      () => db.sql`insert into terms (id, position, is_current) values ('2026-T3', 3, true)`,
      UNIQUE_VIOLATION,
    );
    // Several terms that are not current are fine.
    await db.sql`insert into terms (id, position) values ('2026-T3', 3), ('2026-T4', 4)`;
    await db.sql`delete from terms where id in ('2026-T3', '2026-T4')`;
  });

  it("keep one position per term and per subject", async () => {
    await expectSqlState(
      () => db.sql`insert into terms (id, position) values ('2026-T9', 1)`,
      UNIQUE_VIOLATION,
    );
    await expectSqlState(
      () => db.sql`insert into subjects (name, position) values ('Civic Education', 1)`,
      UNIQUE_VIOLATION,
    );
  });
});
