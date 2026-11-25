import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compareBytewise, type Repository } from "../../src/data/repository.js";
import type { Dataset } from "../../src/data/types.js";

/** A repository over a dataset, and how to let go of it afterwards. */
export interface ContractSubject {
  repo: Repository;
  close(): Promise<void>;
}

/**
 * The behaviour every `Repository` must have (ADR-004, ADR-019). Run it against
 * each implementation with the same dataset: the expected answers are worked out
 * here from the dataset itself, never from the implementation under test.
 */
export function describeRepositoryContract(
  name: string,
  dataset: Dataset,
  open: (dataset: Dataset) => Promise<ContractSubject>,
): void {
  describe(`${name} meets the Repository contract`, () => {
    let subject: ContractSubject;
    let repo: Repository;

    beforeAll(async () => {
      subject = await open(dataset);
      repo = subject.repo;
    });

    afterAll(async () => {
      await subject?.close();
    });

    it("finds each school by ID, and gives undefined for an unknown one", async () => {
      for (const school of dataset.schools) {
        expect(await repo.getSchool(school.id)).toEqual(school);
      }
      expect(await repo.getSchool("sch_nope")).toBeUndefined();
    });

    it("finds each class by ID, and gives undefined for an unknown one", async () => {
      for (const cls of dataset.classes) {
        expect(await repo.getClass(cls.id)).toEqual(cls);
      }
      expect(await repo.getClass("nope")).toBeUndefined();
    });

    it("finds each student by ID, and gives undefined for an unknown one", async () => {
      for (const student of dataset.students) {
        expect(await repo.getStudent(student.id)).toEqual(student);
      }
      expect(await repo.getStudent("nope")).toBeUndefined();
    });

    it("lists a school's classes by level then ID, with student counts, and no other school's", async () => {
      for (const school of dataset.schools) {
        const expected = dataset.classes
          .filter((c) => c.schoolId === school.id)
          .sort((a, b) => a.level - b.level || compareBytewise(a.id, b.id))
          .map((c) => ({
            id: c.id,
            name: c.name,
            level: c.level,
            studentCount: dataset.students.filter((s) => s.classId === c.id).length,
          }));
        expect(await repo.listClasses(school.id)).toEqual(expected);
      }
      expect(await repo.listClasses("sch_nope")).toEqual([]);
    });

    it("lists a class's students by name then ID", async () => {
      for (const cls of dataset.classes) {
        const expected = dataset.students
          .filter((s) => s.classId === cls.id)
          .sort((a, b) => compareBytewise(a.name, b.name) || compareBytewise(a.id, b.id));
        expect(await repo.listStudents(cls.id)).toEqual(expected);
      }
      expect(await repo.listStudents("nope")).toEqual([]);
    });

    it("lists a class's scores for one term, by student ID then subject, keeping missing parts null", async () => {
      for (const cls of dataset.classes) {
        const ids = new Set(dataset.students.filter((s) => s.classId === cls.id).map((s) => s.id));
        for (const term of dataset.terms) {
          const expected = dataset.scores
            .filter((e) => e.term === term && ids.has(e.studentId))
            .sort(
              (a, b) =>
                compareBytewise(a.studentId, b.studentId) || compareBytewise(a.subject, b.subject),
            );
          expect(await repo.listScores(cls.id, term)).toEqual(expected);
        }
      }
    });

    it("gives no scores for an unknown class or an unknown term", async () => {
      const [cls] = dataset.classes;
      expect(await repo.listScores("nope", dataset.currentTerm)).toEqual([]);
      expect(await repo.listScores(cls?.id ?? "", "1999-T1")).toEqual([]);
    });

    it("lists subjects and terms in their defined order", async () => {
      expect(await repo.listSubjects()).toEqual(dataset.subjects);
      expect(await repo.listTerms()).toEqual(dataset.terms);
    });

    it("reports the dataset's current term", async () => {
      expect(await repo.getCurrentTerm()).toBe(dataset.currentTerm);
    });

    it("returns lists that can be changed without changing the data", async () => {
      const subjects = await repo.listSubjects();
      subjects.push("mutated");
      expect(await repo.listSubjects()).toEqual(dataset.subjects);
      const students = await repo.listStudents(dataset.classes[0]?.id ?? "");
      students.pop();
      expect(await repo.listStudents(dataset.classes[0]?.id ?? "")).toHaveLength(
        dataset.students.filter((s) => s.classId === dataset.classes[0]?.id).length,
      );
    });
  });
}
