import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateDataset } from "../src/data/synthetic.js";
import type { Dataset } from "../src/data/types.js";
import { DatabaseError, migrateDatabase, seedDatabase } from "../src/db/index.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

const dataset = generateDataset();

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrateDatabase(db);
});

afterAll(async () => {
  await db?.close();
});

// Each test starts from empty tables. Only the tests do this: the seed never truncates.
beforeEach(async () => {
  await db.sql`truncate scores, students, classes, terms, subjects, schools`;
});

async function count(table: string): Promise<number> {
  const [row] = await db.sql<{ n: number }[]>`select count(*)::int as n from ${db.sql(table)}`;
  return row?.n ?? -1;
}

async function counts() {
  return {
    schools: await count("schools"),
    classes: await count("classes"),
    students: await count("students"),
    subjects: await count("subjects"),
    terms: await count("terms"),
    scores: await count("scores"),
  };
}

const expectedCounts = {
  schools: dataset.schools.length,
  classes: dataset.classes.length,
  students: dataset.students.length,
  subjects: dataset.subjects.length,
  terms: dataset.terms.length,
  scores: dataset.scores.length,
};

describe("seedDatabase", () => {
  it("inserts the whole synthetic dataset and reports what it inserted", async () => {
    const result = await seedDatabase(db);
    expect(await counts()).toEqual(expectedCounts);
    for (const [table, total] of Object.entries(expectedCounts)) {
      expect(result[table as keyof typeof expectedCounts], table).toEqual({
        inserted: total,
        skipped: 0,
      });
    }
    expect(result.currentTermSet).toBe(true);
  });

  it("stores the same data the in-memory dataset holds, including partial scores", async () => {
    // Without partial scores this test would not prove they survive the trip.
    expect(dataset.scores.some((s) => s.ca === null || s.exam === null)).toBe(true);
    await seedDatabase(db);

    const classes = await db.sql<
      { id: string; school_id: string; name: string; level: number }[]
    >`select * from classes order by id`;
    expect(
      classes.map((c) => ({ id: c.id, schoolId: c.school_id, name: c.name, level: c.level })),
    ).toEqual([...dataset.classes].sort((a, b) => a.id.localeCompare(b.id)));

    const students = await db.sql<
      { id: string; class_id: string; name: string }[]
    >`select id, class_id, name from students order by id`;
    expect(students.map((s) => ({ id: s.id, classId: s.class_id, name: s.name }))).toEqual(
      [...dataset.students].sort((a, b) => a.id.localeCompare(b.id)),
    );

    const scores = await db.sql<
      {
        student_id: string;
        subject: string;
        term: string;
        ca: number | null;
        exam: number | null;
      }[]
    >`select student_id, subject, term, ca, exam from scores`;
    const key = (s: { studentId: string; subject: string; term: string }) =>
      `${s.studentId}|${s.subject}|${s.term}`;
    expect(
      scores
        .map((s) => ({
          studentId: s.student_id,
          subject: s.subject,
          term: s.term,
          ca: s.ca,
          exam: s.exam,
        }))
        .sort((a, b) => key(a).localeCompare(key(b))),
    ).toEqual([...dataset.scores].sort((a, b) => key(a).localeCompare(key(b))));
  });

  it("keeps the order of subjects and terms, and marks exactly the current term", async () => {
    await seedDatabase(db);
    const subjects = await db.sql<{ name: string }[]>`select name from subjects order by position`;
    expect(subjects.map((s) => s.name)).toEqual(dataset.subjects);
    const terms = await db.sql<{ id: string; is_current: boolean }[]>`
      select id, is_current from terms order by position`;
    expect(terms.map((t) => t.id)).toEqual(dataset.terms);
    expect(terms.filter((t) => t.is_current).map((t) => t.id)).toEqual([dataset.currentTerm]);
  });

  it("gives every student and score the school of its class", async () => {
    await seedDatabase(db);
    const [row] = await db.sql<{ wrong: number }[]>`
      select (
        (select count(*) from students s join classes c on c.id = s.class_id where c.school_id <> s.school_id)
        + (select count(*) from scores x join students s on s.id = x.student_id where s.school_id <> x.school_id)
      )::int as wrong`;
    expect(row?.wrong).toBe(0);
    const schools = await db.sql<{ school_id: string }[]>`select distinct school_id from students`;
    expect(schools.length).toBe(dataset.schools.length);
  });
});

describe("running it again", () => {
  it("changes nothing and says so", async () => {
    await seedDatabase(db);
    const second = await seedDatabase(db);
    expect(await counts()).toEqual(expectedCounts);
    for (const [table, total] of Object.entries(expectedCounts)) {
      expect(second[table as keyof typeof expectedCounts], table).toEqual({
        inserted: 0,
        skipped: total,
      });
    }
    expect(second.currentTermSet).toBe(false);
  });

  it("does not overwrite rows that exist", async () => {
    await seedDatabase(db);
    await db.sql`update students set name = 'Edited Name' where id = ${dataset.students[0]!.id}`;
    await db.sql`update scores set ca = 1, exam = 2
      where student_id = ${dataset.scores[0]!.studentId}
        and subject = ${dataset.scores[0]!.subject} and term = ${dataset.scores[0]!.term}`;
    await seedDatabase(db);
    const [student] = await db.sql<{ name: string }[]>`
      select name from students where id = ${dataset.students[0]!.id}`;
    const [score] = await db.sql<{ ca: number; exam: number }[]>`
      select ca, exam from scores
      where student_id = ${dataset.scores[0]!.studentId}
        and subject = ${dataset.scores[0]!.subject} and term = ${dataset.scores[0]!.term}`;
    expect(student?.name).toBe("Edited Name");
    expect(score).toEqual({ ca: 1, exam: 2 });
  });

  it("never deletes: rows it did not create are still there afterwards", async () => {
    await seedDatabase(db);
    await db.sql`insert into schools (id, name) values ('sch_extra', 'Extra School')`;
    await seedDatabase(db);
    expect(await count("schools")).toBe(dataset.schools.length + 1);
  });

  it("puts back only what is missing", async () => {
    await seedDatabase(db);
    const target = dataset.students[0]!.id;
    const [row] = await db.sql<{ n: number }[]>`
      select count(*)::int as n from scores where student_id = ${target}`;
    const n = row?.n ?? -1;
    await db.sql`delete from scores where student_id = ${target}`;
    const result = await seedDatabase(db);
    expect(result.scores).toEqual({ inserted: n, skipped: dataset.scores.length - n });
    expect(await counts()).toEqual(expectedCounts);
  });
});

describe("the current term", () => {
  it("is not moved on a later run", async () => {
    await seedDatabase(db);
    await db.sql`update terms set is_current = false`;
    await db.sql`update terms set is_current = true where id = ${dataset.terms[0]!}`;
    expect(dataset.terms[0]).not.toBe(dataset.currentTerm);
    await seedDatabase(db);
    const current = await db.sql<{ id: string }[]>`select id from terms where is_current`;
    expect(current.map((t) => t.id)).toEqual([dataset.terms[0]]);
  });

  it("does not stop the dataset's terms and scores from going in when another term is current", async () => {
    await db.sql`insert into terms (id, position, is_current) values ('2025-T3', 99, true)`;
    const result = await seedDatabase(db);
    expect(result.currentTermSet).toBe(false);
    expect(await count("scores")).toBe(dataset.scores.length);
    const current = await db.sql<{ id: string }[]>`select id from terms where is_current`;
    expect(current.map((t) => t.id)).toEqual(["2025-T3"]);
  });
});

describe("failures", () => {
  it("leave the database as it was (one transaction)", async () => {
    // The scores are inserted last, so everything before them has already gone in
    // when the database rejects this one (CA above 40); it must all be undone.
    const broken: Dataset = {
      ...dataset,
      scores: [{ ...dataset.scores[0]!, ca: 41 }],
    };
    const error = await seedDatabase(db, broken).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error).toMatchObject({ kind: "rejected" });
    // The database's own message, not Drizzle's, which repeats the row values.
    expect((error as Error).message).toMatch(/scores_ca_range/);
    expect((error as Error).message).not.toContain(broken.scores[0]!.studentId);
    expect(await counts()).toEqual({
      schools: 0,
      classes: 0,
      students: 0,
      subjects: 0,
      terms: 0,
      scores: 0,
    });
  });

  it("reject a dataset that is not consistent, before touching the database", async () => {
    const orphan: Dataset = {
      ...dataset,
      students: [{ id: "x", classId: "no_such_class", name: "Nobody" }],
    };
    await expect(seedDatabase(db, orphan)).rejects.toThrow(/unknown class/);
    await expect(seedDatabase(db, { ...dataset, currentTerm: "1999-T9" })).rejects.toThrow(
      /not one of the terms/,
    );
    expect(await counts()).toEqual({
      schools: 0,
      classes: 0,
      students: 0,
      subjects: 0,
      terms: 0,
      scores: 0,
    });
  });

  it("tell you to migrate first when the tables do not exist", async () => {
    const empty = await createTestDatabase();
    try {
      const error = await seedDatabase(empty).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error).toMatchObject({ kind: "not-migrated" });
      expect((error as Error).message).toMatch(/pnpm db:migrate/);
    } finally {
      await empty.close();
    }
  });
});
