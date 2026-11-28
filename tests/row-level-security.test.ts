import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getConfig } from "../src/config/index.js";
import { generateDataset } from "../src/data/synthetic.js";
import {
  APP_ROLE,
  DatabaseError,
  findSqlError,
  migrateDatabase,
  PostgresRepository,
  seedDatabase,
  verifyRowSecurity,
} from "../src/db/index.js";
import { seededDatabase } from "./support/postgres-subject.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// Row-level security (ADR-024), tested in Postgres itself: raw SQL as the restricted
// role, with no repository and no school view in the way, then the repository on top.
const dataset = generateDataset();
const SCHOOL_A = "sch_demo_a";
const SCHOOL_B = "sch_demo_b";
const schoolsInData = [SCHOOL_A, SCHOOL_B];

const classesOf = (schoolId: string) => dataset.classes.filter((c) => c.schoolId === schoolId);
const studentsOf = (schoolId: string) => {
  const ids = new Set(classesOf(schoolId).map((c) => c.id));
  return dataset.students.filter((s) => ids.has(s.classId));
};
const scoresOf = (schoolId: string) => {
  const ids = new Set(studentsOf(schoolId).map((s) => s.id));
  return dataset.scores.filter((s) => ids.has(s.studentId));
};

/** Runs `query` the way the server does: the restricted role, one school, read-only. */
async function asSchool<T>(
  db: TestDatabase,
  schoolId: string | undefined,
  query: (tx: TestDatabase["sql"]) => Promise<T>,
  mode: "read only" | "read write" = "read only",
): Promise<T> {
  const result = await db.sql.begin(mode, async (tx) => {
    await tx`select set_config('role', ${APP_ROLE}, true)`;
    if (schoolId !== undefined) await tx`select set_config('app.school_id', ${schoolId}, true)`;
    return query(tx as unknown as TestDatabase["sql"]);
  });
  return result as T;
}

const count = async (db: TestDatabase, schoolId: string | undefined, table: string) => {
  const [row] = await asSchool(
    db,
    schoolId,
    (tx) => tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)}`,
  );
  return row?.n;
};

describe("row-level security in Postgres", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await seededDatabase(dataset);
  });
  afterAll(async () => {
    await db?.close();
  });

  it("shows each school its own rows in every tenant table, and no one else's", async () => {
    // Sanity: the owner sees everything, so the filtering below is not an empty database.
    expect(await db.sql`select 1 from students`).toHaveLength(dataset.students.length);

    for (const schoolId of schoolsInData) {
      expect(await count(db, schoolId, "schools")).toBe(1);
      expect(await count(db, schoolId, "classes")).toBe(classesOf(schoolId).length);
      expect(await count(db, schoolId, "students")).toBe(studentsOf(schoolId).length);
      expect(await count(db, schoolId, "scores")).toBe(scoresOf(schoolId).length);
    }
    // The two schools together are the whole table: nothing is visible to both.
    expect(schoolsInData.reduce((sum, id) => sum + classesOf(id).length, 0)).toBe(
      dataset.classes.length,
    );
  });

  it("shows subjects and terms, which every school shares, to every school", async () => {
    for (const schoolId of schoolsInData) {
      expect(await count(db, schoolId, "subjects")).toBe(dataset.subjects.length);
      expect(await count(db, schoolId, "terms")).toBe(dataset.terms.length);
    }
  });

  it("shows nothing when no school was set, or an unknown or empty one", async () => {
    for (const table of ["schools", "classes", "students", "scores"]) {
      expect(await count(db, undefined, table)).toBe(0);
      expect(await count(db, "", table)).toBe(0);
      expect(await count(db, "sch_nope", table)).toBe(0);
    }
  });

  it("cannot be widened by the query: asking for another school's rows finds none", async () => {
    const other = classesOf(SCHOOL_B)[0];
    expect(other).toBeDefined();
    const byId = await asSchool(
      db,
      SCHOOL_A,
      (tx) => tx`select * from classes where id = ${other?.id ?? ""}`,
    );
    const byOwner = await asSchool(
      db,
      SCHOOL_A,
      (tx) => tx`select * from classes where school_id = ${SCHOOL_B}`,
    );
    const joined = await asSchool(
      db,
      SCHOOL_A,
      (tx) => tx`select s.id from students s join classes c on c.id = s.class_id
                 where c.school_id = ${SCHOOL_B} or s.school_id = ${SCHOOL_B}`,
    );
    const union = await asSchool(
      db,
      SCHOOL_A,
      (tx) =>
        tx`select id from classes union all select id from classes where school_id = ${SCHOOL_B}`,
    );
    expect(byId).toHaveLength(0);
    expect(byOwner).toHaveLength(0);
    expect(joined).toHaveLength(0);
    expect(union).toHaveLength(classesOf(SCHOOL_A).length);
  });

  it("cannot write, even to rows it can see", async () => {
    const mine = classesOf(SCHOOL_A)[0]?.id ?? "";
    const attempts: [string, (tx: TestDatabase["sql"]) => Promise<unknown>][] = [
      ["insert", (tx) => tx`insert into schools (id, name) values ('sch_x', 'X')`],
      ["update", (tx) => tx`update classes set name = 'renamed' where id = ${mine}`],
      ["delete", (tx) => tx`delete from scores where school_id = ${SCHOOL_A}`],
      ["truncate", (tx) => tx`truncate students`],
    ];
    for (const [name, attempt] of attempts) {
      // In a read-write transaction, so the refusal is the role's own: no privilege (42501).
      const own = await asSchool(db, SCHOOL_A, attempt, "read write").catch((e: unknown) => e);
      expect(findSqlError(own)?.code, name).toBe("42501");
      // And the transaction the server opens refuses writes as well (25006).
      const readOnly = await asSchool(db, SCHOOL_A, attempt).catch((e: unknown) => e);
      expect(findSqlError(readOnly)?.code, name).toBe("25006");
    }
    expect(await db.sql`select 1 from classes where name = 'renamed'`).toHaveLength(0);
  });

  it("cannot read the token hashes, the migrations table, or any other table", async () => {
    await db.sql`insert into school_tokens (id, school_id, token_hash)
                 values ('t1', ${SCHOOL_A}, ${"a".repeat(64)})`;
    for (const table of ["school_tokens", "drizzle.__drizzle_migrations"]) {
      const error = await asSchool(db, SCHOOL_A, (tx) => tx.unsafe(`select * from ${table}`)).catch(
        (e: unknown) => e,
      );
      expect(findSqlError(error)?.code, table).toBe("42501");
    }
  });

  it("is a role that cannot log in, bypass security or create anything", async () => {
    const [role] = await db.sql<Record<string, boolean>[]>`
      select rolsuper, rolcanlogin, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
      from pg_roles where rolname = ${APP_ROLE}`;
    expect(role).toEqual({
      rolsuper: false,
      rolcanlogin: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
    });
  });

  it("covers every table it can read: a tenant table with no policy would fail here", async () => {
    const readable = await db.sql<
      { name: string; secured: boolean; policies: number; tenant: boolean }[]
    >`
      select c.relname as name,
             c.relrowsecurity as secured,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
             (c.relname = 'schools' or exists (
               select 1 from information_schema.columns k
               where k.table_schema = 'public' and k.table_name = c.relname
                 and k.column_name = 'school_id')) as tenant
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege(${APP_ROLE}, c.oid, 'select')
      order by c.relname`;
    // A new table is unreadable until someone grants it on purpose, and then it is listed here.
    expect(readable.map((t) => t.name)).toEqual([
      "classes",
      "schools",
      "scores",
      "students",
      "subjects",
      "terms",
    ]);
    for (const table of readable.filter((t) => t.tenant)) {
      expect(table.secured, `${table.name} has row-level security`).toBe(true);
      expect(table.policies, `${table.name} has a policy`).toBeGreaterThan(0);
    }
    const writable = await db.sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (has_table_privilege(${APP_ROLE}, c.oid, 'insert')
          or has_table_privilege(${APP_ROLE}, c.oid, 'update')
          or has_table_privilege(${APP_ROLE}, c.oid, 'delete'))`;
    expect(writable).toHaveLength(0);
  });

  it("keeps the owner's full access, which seeding, migrations and token checks need", async () => {
    expect(await db.sql`select 1 from scores`).toHaveLength(dataset.scores.length);
    expect(await db.sql`select 1 from school_tokens`).toHaveLength(1);
  });

  it("can be migrated again, and the startup check passes", async () => {
    await migrateDatabase(db);
    await expect(verifyRowSecurity(db)).resolves.toBeUndefined();
  });
});

describe("the context ends with the transaction", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    // One connection only, so every query below reuses the one the restricted work used.
    db = await createTestDatabase(getConfig(), { max: 1 });
    await migrateDatabase(db);
    await seedDatabase(db, dataset);
  });
  afterAll(async () => {
    await db?.close();
  });

  it("hands a pooled connection back as the owner, with no school left on it", async () => {
    const repo = new PostgresRepository(db, { restrictedToSchool: SCHOOL_A });
    await repo.listClasses(SCHOOL_A);

    const [after] = await db.sql<{ me: string; school: string | null }[]>`
      select current_user as me, nullif(current_setting('app.school_id', true), '') as school`;
    expect(after?.me).not.toBe(APP_ROLE);
    expect(after?.school).toBeNull();
    // And it is not restricted any more: the owner sees both schools again.
    expect(await db.sql`select 1 from classes`).toHaveLength(dataset.classes.length);
  });

  it("does not carry one school into the next call, even on the same connection", async () => {
    const a = new PostgresRepository(db, { restrictedToSchool: SCHOOL_A });
    const b = new PostgresRepository(db, { restrictedToSchool: SCHOOL_B });
    const ids = async (repo: PostgresRepository, school: string) =>
      (await repo.listClasses(school)).map((c) => c.id);
    for (let i = 0; i < 3; i += 1) {
      expect(await ids(a, SCHOOL_A)).toEqual(
        classesOf(SCHOOL_A)
          .map((c) => c.id)
          .sort(),
      );
      expect(await ids(b, SCHOOL_B)).toEqual(
        classesOf(SCHOOL_B)
          .map((c) => c.id)
          .sort(),
      );
    }
  });
});

describe("PostgresRepository restricted to a school", () => {
  let db: TestDatabase;
  let unrestricted: PostgresRepository;

  beforeAll(async () => {
    db = await seededDatabase(dataset);
    unrestricted = new PostgresRepository(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  const restricted = (schoolId: string) =>
    new PostgresRepository(db, { restrictedToSchool: schoolId });

  it("gives exactly what the unrestricted repository gives for its own school", async () => {
    const term = await unrestricted.getCurrentTerm();
    for (const schoolId of schoolsInData) {
      const repo = restricted(schoolId);
      expect(await repo.getSchool(schoolId)).toEqual(await unrestricted.getSchool(schoolId));
      expect(await repo.listClasses(schoolId)).toEqual(await unrestricted.listClasses(schoolId));
      for (const cls of classesOf(schoolId)) {
        expect(await repo.getClass(cls.id)).toEqual(await unrestricted.getClass(cls.id));
        expect(await repo.listStudents(cls.id)).toEqual(await unrestricted.listStudents(cls.id));
        expect(await repo.listScores(cls.id, term)).toEqual(
          await unrestricted.listScores(cls.id, term),
        );
      }
      const student = studentsOf(schoolId)[0];
      expect(await repo.getStudent(student?.id ?? "")).toEqual(
        await unrestricted.getStudent(student?.id ?? ""),
      );
      expect(await repo.listSubjects()).toEqual(await unrestricted.listSubjects());
      expect(await repo.listTerms()).toEqual(await unrestricted.listTerms());
      expect(await repo.getCurrentTerm()).toBe(term);
    }
  });

  it("finds another school's data absent on its own, with no school view in front of it", async () => {
    const term = await unrestricted.getCurrentTerm();
    const repo = restricted(SCHOOL_A);
    const foreignClass = classesOf(SCHOOL_B)[0]?.id ?? "";
    const foreignStudent = studentsOf(SCHOOL_B)[0]?.id ?? "";
    // Make sure there is something to hide.
    expect(await unrestricted.listStudents(foreignClass)).not.toHaveLength(0);
    expect(await unrestricted.listScores(foreignClass, term)).not.toHaveLength(0);

    expect(await repo.getSchool(SCHOOL_B)).toBeUndefined();
    expect(await repo.listClasses(SCHOOL_B)).toEqual([]);
    expect(await repo.getClass(foreignClass)).toBeUndefined();
    expect(await repo.getStudent(foreignStudent)).toBeUndefined();
    expect(await repo.listStudents(foreignClass)).toEqual([]);
    expect(await repo.listScores(foreignClass, term)).toEqual([]);
  });

  it("sees nothing of a school that does not exist, and refuses an empty school", async () => {
    const repo = restricted("sch_nope");
    expect(await repo.listClasses("sch_nope")).toEqual([]);
    expect(await repo.getSchool("sch_nope")).toBeUndefined();
    expect(() => restricted("")).toThrow("school ID");
  });

  it("treats a school ID that tries to be SQL as plain text", async () => {
    const hostile = `${SCHOOL_A}' or '1'='1`;
    const repo = restricted(hostile);
    expect(await repo.listClasses(hostile)).toEqual([]);
    expect(await repo.getClass(classesOf(SCHOOL_A)[0]?.id ?? "")).toBeUndefined();
  });
});

describe("verifyRowSecurity", () => {
  it("says to migrate when the role is missing, and to grant it when it cannot be used", async () => {
    // The role belongs to the whole server, so it is not dropped here (other test files
    // are using it). The two failures are produced by a connection that cannot use it.
    const db = await seededDatabase(dataset);
    const name = `rezen_probe_${Math.random().toString(16).slice(2, 10)}`;
    try {
      await db.sql.unsafe(`create role ${name} login password 'probe' nosuperuser`);
      const { createDatabase } = await import("../src/db/index.js");
      const { urlOf } = await import("./support/postgres-subject.js");
      const url = new URL(urlOf(db));
      url.username = name;
      url.password = "probe";
      const outsider = createDatabase({
        DATABASE_URL: url.toString(),
        DB_PROVIDER: getConfig().DB_PROVIDER,
      });
      try {
        const error = await verifyRowSecurity(outsider).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(DatabaseError);
        expect((error as DatabaseError).kind).toBe("no-app-role");
        expect((error as DatabaseError).message).toContain("pnpm db:migrate");
      } finally {
        await outsider.close();
      }
    } finally {
      await db.close();
      const admin = await createTestDatabase();
      await admin.sql.unsafe(`drop role if exists ${name}`);
      await admin.close();
    }
  });
});
