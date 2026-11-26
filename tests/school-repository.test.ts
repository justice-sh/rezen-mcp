import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryRepository, type Repository } from "../src/data/repository.js";
import { scopeToSchool } from "../src/data/school-repository.js";
import { generateDataset } from "../src/data/synthetic.js";
import type { Dataset } from "../src/data/types.js";
import { openInMemorySubject, openPostgresSubject } from "./support/postgres-subject.js";
import type { ContractSubject } from "./support/repository-contract.js";

// A school's view must give its own data exactly as the repository does, and
// must make every other school's data look like an unknown ID (ADR-021). The
// expected answers come from the dataset, and the same tests run on both stores.
const dataset = generateDataset();
const terms = [...dataset.terms, "1999-T1"];
const UNKNOWN = "nope";

const stores: [string, (dataset: Dataset) => Promise<ContractSubject>][] = [
  ["in-memory", openInMemorySubject],
  ["Postgres", openPostgresSubject],
];

describe("the dataset can show isolation", () => {
  it("has two schools, each with classes, students and scores", () => {
    expect(dataset.schools.length).toBeGreaterThanOrEqual(2);
    for (const school of dataset.schools) {
      const classes = dataset.classes.filter((c) => c.schoolId === school.id);
      expect(classes.length).toBeGreaterThan(0);
      const students = dataset.students.filter((s) => classes.some((c) => c.id === s.classId));
      expect(students.length).toBeGreaterThan(0);
      const scores = dataset.scores.filter((e) => students.some((s) => s.id === e.studentId));
      expect(scores.length).toBeGreaterThan(0);
    }
  });
});

describe.each(stores)("a school's view over the %s store", (_name, open) => {
  let subject: ContractSubject;
  let repo: Repository;

  beforeAll(async () => {
    subject = await open(dataset);
    repo = subject.repo;
  });

  afterAll(async () => {
    await subject?.close();
  });

  const ownClasses = (schoolId: string) => dataset.classes.filter((c) => c.schoolId === schoolId);
  const otherClasses = (schoolId: string) => dataset.classes.filter((c) => c.schoolId !== schoolId);

  it("knows its school, and the school's own classes with their student counts", async () => {
    for (const school of dataset.schools) {
      const view = scopeToSchool(repo, school.id);
      expect(view.schoolId).toBe(school.id);
      expect(await view.getSchool()).toEqual(school);
      const listed = await view.listClasses();
      expect(listed.map((c) => c.id)).toEqual(
        ownClasses(school.id)
          .map((c) => c.id)
          .sort(),
      );
      expect(listed).toEqual(await repo.listClasses(school.id));
    }
  });

  it("gives its own classes and students exactly as the repository does", async () => {
    for (const school of dataset.schools) {
      const view = scopeToSchool(repo, school.id);
      for (const cls of ownClasses(school.id)) {
        expect(await view.getClass(cls.id)).toEqual(cls);
        expect(await view.listStudents(cls.id)).toEqual(await repo.listStudents(cls.id));
        for (const student of await repo.listStudents(cls.id)) {
          expect(await view.getStudent(student.id)).toEqual(student);
        }
      }
    }
  });

  it("gives its own scores, in every term, exactly as the repository does", async () => {
    for (const school of dataset.schools) {
      const view = scopeToSchool(repo, school.id);
      for (const cls of ownClasses(school.id)) {
        for (const term of terms) {
          expect(await view.listScores(cls.id, term)).toEqual(await repo.listScores(cls.id, term));
        }
      }
    }
  });

  it("makes another school's class look unknown, in every read", async () => {
    for (const school of dataset.schools) {
      const view = scopeToSchool(repo, school.id);
      for (const cls of otherClasses(school.id)) {
        // The data really is there, so an empty answer means the scope worked.
        expect(await repo.getClass(cls.id)).toBeDefined();
        expect((await repo.listStudents(cls.id)).length).toBeGreaterThan(0);

        expect(await view.getClass(cls.id)).toEqual(await view.getClass(UNKNOWN));
        expect(await view.getClass(cls.id)).toBeUndefined();
        expect(await view.listStudents(cls.id)).toEqual(await view.listStudents(UNKNOWN));
        expect(await view.listStudents(cls.id)).toEqual([]);
        for (const term of terms) {
          expect(await view.listScores(cls.id, term)).toEqual([]);
        }
      }
    }
  });

  it("makes another school's student look unknown", async () => {
    for (const school of dataset.schools) {
      const view = scopeToSchool(repo, school.id);
      const own = new Set(ownClasses(school.id).map((c) => c.id));
      const others = dataset.students.filter((s) => !own.has(s.classId));
      expect(others.length).toBeGreaterThan(0);
      for (const student of others) {
        expect(await repo.getStudent(student.id)).toEqual(student);
        expect(await view.getStudent(student.id)).toEqual(await view.getStudent(UNKNOWN));
        expect(await view.getStudent(student.id)).toBeUndefined();
      }
    }
  });

  it("answers an unknown ID of any kind with undefined or an empty list", async () => {
    const view = scopeToSchool(repo, dataset.schools[0]?.id ?? "");
    expect(await view.getClass(UNKNOWN)).toBeUndefined();
    expect(await view.getStudent(UNKNOWN)).toBeUndefined();
    expect(await view.listStudents(UNKNOWN)).toEqual([]);
    expect(await view.listScores(UNKNOWN, dataset.currentTerm)).toEqual([]);
  });

  it("shares the subjects, the terms and the current term between schools", async () => {
    for (const school of dataset.schools) {
      const view = scopeToSchool(repo, school.id);
      expect(await view.listSubjects()).toEqual(dataset.subjects);
      expect(await view.listTerms()).toEqual(dataset.terms);
      expect(await view.getCurrentTerm()).toBe(dataset.currentTerm);
    }
  });

  it("sees none of a school's data when the school does not exist", async () => {
    const view = scopeToSchool(repo, "sch_nope");
    expect(await view.getSchool()).toBeUndefined();
    expect(await view.listClasses()).toEqual([]);
    for (const cls of dataset.classes) {
      expect(await view.getClass(cls.id)).toBeUndefined();
      expect(await view.listStudents(cls.id)).toEqual([]);
      expect(await view.listScores(cls.id, dataset.currentTerm)).toEqual([]);
    }
    for (const student of dataset.students) {
      expect(await view.getStudent(student.id)).toBeUndefined();
    }
  });
});

describe("how a school's view is built", () => {
  it("refuses an empty school ID", () => {
    expect(() => scopeToSchool(createRecorder().repo, "")).toThrow(/school ID/);
  });

  it("does not read another school's students or scores at all", async () => {
    const { repo, calls } = createRecorder();
    const [first, second] = dataset.schools;
    const view = scopeToSchool(repo, first?.id ?? "");
    const foreign = dataset.classes.find((c) => c.schoolId === second?.id);
    expect(foreign).toBeDefined();

    await view.listStudents(foreign?.id ?? "");
    await view.listScores(foreign?.id ?? "", dataset.currentTerm);
    expect(calls).not.toContain("listStudents");
    expect(calls).not.toContain("listScores");
  });

  it("does not hand out the repository behind it", () => {
    const view = scopeToSchool(createRecorder().repo, "sch_demo_a");
    expect(Object.keys(view).sort()).toEqual(["schoolId"]);
    expect(Object.getOwnPropertyNames(view).sort()).toEqual(["schoolId"]);
    expect(JSON.stringify(view)).toBe('{"schoolId":"sch_demo_a"}');
  });
});

/** An in-memory repository that records the names of the methods called on it. */
function createRecorder(): { repo: Repository; calls: string[] } {
  const real = new InMemoryRepository(dataset);
  const calls: string[] = [];
  const repo = new Proxy(real, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push(String(property));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { repo, calls };
}
