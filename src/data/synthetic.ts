import type { Dataset, School, SchoolClass, ScoreEntry, Student } from "./types.js";

/**
 * Deterministic PRNG (mulberry32). The same seed always yields the same
 * dataset, which keeps tests and evals reproducible.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Ada",
  "Tobi",
  "Zara",
  "Kemi",
  "Femi",
  "Ife",
  "Dayo",
  "Nuru",
  "Sade",
  "Emeka",
  "Tunde",
  "Amina",
  "Chidi",
  "Lola",
  "Bayo",
  "Hauwa",
];
const LAST_NAMES = [
  "Okoro",
  "Bello",
  "Adeyemi",
  "Eze",
  "Musa",
  "Okafor",
  "Danjuma",
  "Nwosu",
  "Ibrahim",
  "Balogun",
  "Obi",
  "Yusuf",
  "Afolabi",
  "Umeh",
  "Ojo",
  "Sani",
];
export const SUBJECTS = ["Mathematics", "English", "Basic Science", "Social Studies"] as const;
export const DEFAULT_TERM = "2026-T1";

export interface GenerateOptions {
  seed?: number;
  classesPerSchool?: number;
  studentsPerClass?: number;
  /** Probability that a single score entry is missing (to exercise edge cases). */
  missingScoreRate?: number;
}

const DEMO_SCHOOLS: School[] = [
  { id: "sch_demo_a", name: "Demo School A" },
  { id: "sch_demo_b", name: "Demo School B" },
];

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] as T;
}

export function generateDataset(options: GenerateOptions = {}): Dataset {
  const {
    seed = 42,
    classesPerSchool = 4,
    studentsPerClass = 12,
    missingScoreRate = 0.03,
  } = options;
  const rng = createRng(seed);

  const classes: SchoolClass[] = [];
  const students: Student[] = [];
  const scores: ScoreEntry[] = [];

  for (const school of DEMO_SCHOOLS) {
    for (let c = 0; c < classesPerSchool; c++) {
      const level = c + 1;
      const classId = `${school.id}_c${level}`;
      classes.push({ id: classId, schoolId: school.id, name: `Primary ${level}`, level });

      for (let s = 0; s < studentsPerClass; s++) {
        const studentId = `${classId}_s${s + 1}`;
        const name = `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
        students.push({ id: studentId, classId, name });

        for (const subject of SUBJECTS) {
          if (rng() < missingScoreRate) continue;
          scores.push({
            studentId,
            subject,
            term: DEFAULT_TERM,
            ca: Math.floor(rng() * 41),
            exam: Math.floor(rng() * 61),
          });
        }
      }
    }
  }

  return { schools: DEMO_SCHOOLS.map((s) => ({ ...s })), classes, students, scores };
}
