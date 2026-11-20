import { generateDataset } from "./synthetic.js";
import type { Dataset, School, SchoolClass } from "./types.js";

export interface ClassSummary {
  id: string;
  name: string;
  level: number;
  studentCount: number;
}

/**
 * Data access boundary. Tools depend on this interface only, so the
 * in-memory implementation can be swapped for Postgres in Phase 2
 * (see docs/DECISIONS.md, ADR-004) without touching tool code.
 */
export interface Repository {
  getSchool(schoolId: string): Promise<School | undefined>;
  listClasses(schoolId: string): Promise<ClassSummary[]>;
}

export class InMemoryRepository implements Repository {
  constructor(private readonly data: Dataset) {}

  async getSchool(schoolId: string): Promise<School | undefined> {
    return this.data.schools.find((s) => s.id === schoolId);
  }

  async listClasses(schoolId: string): Promise<ClassSummary[]> {
    const classes: SchoolClass[] = this.data.classes
      .filter((c) => c.schoolId === schoolId)
      .sort((a, b) => a.level - b.level);

    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      studentCount: this.data.students.filter((s) => s.classId === c.id).length,
    }));
  }
}

export function createInMemoryRepository(seed?: number): InMemoryRepository {
  return new InMemoryRepository(generateDataset(seed === undefined ? {} : { seed }));
}
