import type { Dataset, ScoreEntry } from "../src/data/types.js";

/**
 * A tiny hand-built dataset with known edge cases. Expected results:
 *
 * 2026-T1, class `c1`, subjects Maths + English:
 *   Ada   Maths 80, English 80 -> total 160, position 1 (tie)
 *   Bola  Maths 80, English 80 -> total 160, position 1 (tie)
 *   Chi   Maths 60, English 60 -> total 120, position 3 (skips 2)
 *   Fola  Maths 50, English 50 -> total 100, position 4
 *   Dayo  Maths 40, English CA 10 / exam missing -> unranked
 *   Emeka no entries at all -> unranked
 *
 * 2026-T2 (the current term): only Ada has scores (200 total).
 */
export const SCHOOL_ID = "sch_t";
export const CLASS_ID = "c1";

function entry(
  studentId: string,
  subject: string,
  term: string,
  ca: number | null,
  exam: number | null,
): ScoreEntry {
  return { studentId, subject, term, ca, exam };
}

export function edgeCaseDataset(): Dataset {
  const t1 = "2026-T1";
  const t2 = "2026-T2";
  return {
    schools: [{ id: SCHOOL_ID, name: "Test School" }],
    classes: [{ id: CLASS_ID, schoolId: SCHOOL_ID, name: "Primary 1", level: 1 }],
    students: [
      { id: "st_ada", classId: CLASS_ID, name: "Ada Okoro" },
      { id: "st_bola", classId: CLASS_ID, name: "Bola Eze" },
      { id: "st_chi", classId: CLASS_ID, name: "Chi Musa" },
      { id: "st_dayo", classId: CLASS_ID, name: "Dayo Obi" },
      { id: "st_emeka", classId: CLASS_ID, name: "Emeka Sani" },
      { id: "st_fola", classId: CLASS_ID, name: "Fola Ojo" },
    ],
    subjects: ["Maths", "English"],
    terms: [t1, t2],
    currentTerm: t2,
    scores: [
      entry("st_ada", "Maths", t1, 30, 50),
      entry("st_ada", "English", t1, 30, 50),
      entry("st_bola", "Maths", t1, 30, 50),
      entry("st_bola", "English", t1, 30, 50),
      entry("st_chi", "Maths", t1, 20, 40),
      entry("st_chi", "English", t1, 20, 40),
      entry("st_fola", "Maths", t1, 25, 25),
      entry("st_fola", "English", t1, 25, 25),
      entry("st_dayo", "Maths", t1, 15, 25),
      entry("st_dayo", "English", t1, 10, null),
      entry("st_ada", "Maths", t2, 40, 60),
      entry("st_ada", "English", t2, 40, 60),
    ],
  };
}
