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
/** Chronological order. */
export const TERMS = ["2026-T1", "2026-T2"] as const;

export interface GenerateOptions {
  seed?: number;
  classesPerSchool?: number;
  studentsPerClass?: number;
  /** Probability that a whole score entry (CA and exam) is missing. */
  missingScoreRate?: number;
  /** Probability that just one component (CA or exam) of an entry is missing. */
  partialScoreRate?: number;
  /** The term in progress. Defaults to the last term in TERMS. */
  currentTerm?: string;
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
    partialScoreRate = 0.02,
    currentTerm = TERMS[TERMS.length - 1] as string,
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

        for (const term of TERMS) {
          for (const subject of SUBJECTS) {
            // Always draw the same number of random values per entry so the
            // dataset stays stable when the rates change.
            const caValue = Math.floor(rng() * 41);
            const examValue = Math.floor(rng() * 61);
            const entryRoll = rng();
            const caRoll = rng();
            const examRoll = rng();

            if (entryRoll < missingScoreRate) continue;
            scores.push({
              studentId,
              subject,
              term,
              ca: caRoll < partialScoreRate ? null : caValue,
              exam: examRoll < partialScoreRate ? null : examValue,
            });
          }
        }
      }
    }
  }

  return {
    schools: DEMO_SCHOOLS.map((s) => ({ ...s })),
    classes,
    students,
    scores,
    subjects: [...SUBJECTS],
    terms: [...TERMS],
    currentTerm,
  };
}
