import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The Postgres schema, one table per concept in `src/data/types.ts`.
 * Migrations in `drizzle/` are generated from this file (`pnpm db:generate`).
 * See ADR-016 for the reasoning behind the shape.
 *
 * Tenancy: `classes`, `students` and `scores` all carry `school_id`, and composite
 * foreign keys force it to agree down the chain (a student's school is its class's
 * school, a score's school is its student's school). Row-level security can then
 * filter on one column of the row itself, with no joins (a later slice).
 *
 * All data is synthetic. Ids are text because the domain uses string ids.
 */

export const schools = pgTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const classes = pgTable(
  "classes",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id),
    /** Display name, e.g. "Primary 4". */
    name: text("name").notNull(),
    /** Grade level as a number, e.g. 4 for Primary 4. */
    level: integer("level").notNull(),
  },
  (table) => [
    // Target of the composite foreign key from `students`.
    unique("classes_id_school_id_key").on(table.id, table.schoolId),
    index("classes_school_id_idx").on(table.schoolId),
  ],
);

export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull(),
    schoolId: text("school_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    // The student's school must be the school of its class.
    foreignKey({
      name: "students_class_school_fk",
      columns: [table.classId, table.schoolId],
      foreignColumns: [classes.id, classes.schoolId],
    }),
    // Target of the composite foreign key from `scores`.
    unique("students_id_school_id_key").on(table.id, table.schoolId),
    index("students_class_id_idx").on(table.classId),
  ],
);

/** Subjects, with `position` giving the display order. */
export const subjects = pgTable(
  "subjects",
  {
    name: text("name").primaryKey(),
    position: integer("position").notNull(),
  },
  (table) => [unique("subjects_position_key").on(table.position)],
);

/**
 * Terms, with `position` giving the chronological order. At most one term is the
 * current one (the term in progress). It is global, not per school, in v1.
 */
export const terms = pgTable(
  "terms",
  {
    /** Term identifier, e.g. "2026-T1". */
    id: text("id").primaryKey(),
    position: integer("position").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (table) => [
    unique("terms_position_key").on(table.position),
    // A unique index over only the current rows: two current terms are impossible.
    uniqueIndex("terms_one_current_idx")
      .on(table.isCurrent)
      .where(sql`${table.isCurrent}`),
  ],
);

/**
 * One row per student, subject and term. A missing entry is the absence of a row;
 * a partly entered one has a null `ca` or `exam`.
 */
export const scores = pgTable(
  "scores",
  {
    studentId: text("student_id").notNull(),
    schoolId: text("school_id").notNull(),
    subject: text("subject")
      .notNull()
      .references(() => subjects.name),
    term: text("term")
      .notNull()
      .references(() => terms.id),
    /** Continuous assessment score (0-40), or null if not yet entered. */
    ca: integer("ca"),
    /** Exam score (0-60), or null if not yet entered. */
    exam: integer("exam"),
  },
  (table) => [
    primaryKey({ name: "scores_pkey", columns: [table.studentId, table.subject, table.term] }),
    // The score's school must be the school of its student.
    foreignKey({
      name: "scores_student_school_fk",
      columns: [table.studentId, table.schoolId],
      foreignColumns: [students.id, students.schoolId],
    }),
    check("scores_ca_range", sql`${table.ca} is null or ${table.ca} between 0 and 40`),
    check("scores_exam_range", sql`${table.exam} is null or ${table.exam} between 0 and 60`),
  ],
);
