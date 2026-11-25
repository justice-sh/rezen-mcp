# Feature Spec: rezen-mcp

|                  |                      |
| ---------------- | -------------------- |
| **Status**       | Draft v0.1 (Phase 0) |
| **Last updated** | 2026-11-20           |
| **Owner**        | Justice N.           |

## 1. Problem

School staff spend hours answering the same questions from report-card data: _Who is top of Primary 3? Whose scores are still missing? How did this student do in Mathematics?_ An AI assistant could answer these, but only if it has a **small, reliable, well-described tool surface** and strict boundaries around whose data it can see.

## 2. Goals

1. Expose school results data to MCP-capable assistants through a small set of **read-only** tools.
2. Make tool behaviour **measurable**: every tool has tests and eval cases, and results are published.
3. Enforce **per-school isolation** so one school's token can never read another school's data.
4. Be easy to **extend**: adding a tool should follow a short, documented path (see `CONTRIBUTING.md`).

## 3. Non-goals (v1)

- Write operations (entering or editing scores).
- Real student or school data. **All data is synthetic.**
- A UI, payments, or user management.
- Integrating with a specific identity provider.

## 4. Users and primary scenarios

| User                             | Scenario                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| Teacher                          | "Which students in Primary 4 have missing scores this term?" |
| Head teacher                     | "Rank Primary 3 for this term and show ties."                |
| Parent-facing assistant (future) | "Summarise Ada's report for this term."                      |
| Developer                        | Add a new tool, run evals, compare models.                   |

## 5. Domain and grading rules (defaults)

- Each score entry has a continuous assessment (**CA, 0 to 40**) and an **exam (0 to 60)** per student, subject and term.
- Subject total = CA + exam (0 to 100). Student total = sum of subject totals. Average = student total / number of subjects.
- Grade bands (fixed in v1; making them configurable per school is a later feature, see ADR-010):

| Total     | Grade |
| --------- | ----- |
| 70 to 100 | A     |
| 60 to 69  | B     |
| 50 to 59  | C     |
| 45 to 49  | D     |
| 40 to 44  | E     |
| 0 to 39   | F     |

- **Ranking:** by student total, descending, using standard competition ranking (ties share a position and the next position is skipped: 1, 2, 2, 4).
- **Missing scores:** a student with any missing subject score is **not ranked** and is listed separately as unranked with the missing subjects (see Open questions).

## 6. Tools

All tools are read-only (`readOnlyHint: true`). An unknown ID and a different school's ID both return the **same** "not found" error, so existence is never leaked across schools.

### 6.1 `list_classes`: _Phase 0, done_

|             |                                                                                   |
| ----------- | --------------------------------------------------------------------------------- |
| **Purpose** | Discover class IDs for a school.                                                  |
| **Input**   | `schoolId: string` (Phase 2: no input; school comes from the token)               |
| **Output**  | `school: string`, `classes: { id, name, level, studentCount }[]` ordered by level |
| **Errors**  | Unknown school ID                                                                 |

### 6.2 `get_class_results`: _Phase 1, done_

|             |                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **Purpose** | All scores for a class in a term.                                                                                     |
| **Input**   | `classId: string`, `term?: string` (default: current term)                                                            |
| **Output**  | Per student: per-subject `{ ca, exam, total, grade }`, student total, average. Missing entries are `null`, never `0`. |
| **Errors**  | Unknown class, unknown term                                                                                           |

### 6.3 `get_student_report`: _Phase 1, done_

|             |                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose** | One student's report-card data.                                                                                                                        |
| **Input**   | `studentId: string`, `term?: string`                                                                                                                   |
| **Output**  | Student, class, subject rows with grades, total, average, class position (or `null` if unranked), missing subjects. Facts only: no generated comments. |
| **Errors**  | Unknown student, unknown term                                                                                                                          |

### 6.4 `rank_class`: _Phase 1, done_

|             |                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| **Purpose** | Class ranking for a term.                                                                               |
| **Input**   | `classId: string`, `term?: string`                                                                      |
| **Output**  | `ranked: { position, studentId, name, total }[]` and `unranked: { studentId, name, missingSubjects }[]` |
| **Errors**  | Unknown class, unknown term                                                                             |

### 6.5 `find_missing_scores`: _Phase 1, done_

|             |                                                                                |
| ----------- | ------------------------------------------------------------------------------ |
| **Purpose** | Find incomplete entries before report cards are generated.                     |
| **Input**   | `classId: string`, `term?: string`                                             |
| **Output**  | `missing: { studentId, name, subject, component: "ca" \| "exam" \| "both" }[]` |
| **Errors**  | Unknown class, unknown term                                                    |

## 7. Resources and prompts

- **Resource** `rezen://grading-rules`: the grading rules in section 5, as text, so assistants can explain results consistently. _(Phase 1, done)_
- **Prompt** `summarise_class_term`: a template that asks for a short class summary using the tools above. _(Phase 1, done)_

## 8. Tenancy and security

- **Phase 0 to 1:** the school is passed as a tool argument (demo only).
- **Phase 2:** one token per school. The server derives the school from the token. Postgres **row-level security** enforces isolation as a second layer. Tool inputs no longer include `schoolId` (a documented breaking change).
- No personal data in logs. Inputs validated with Zod. No secrets in the repository.
- Configuration comes from environment variables, validated at startup in one place. Files are layered (`.env`, then `.env.<NODE_ENV>`) and real environment variables always win (ADR-013). Postgres is reached through one `DATABASE_URL`; `DB_PROVIDER` (`docker` or `local`) selects the implementation (ADR-014). In development and test, `DATABASE_URL` may instead be a JSON map of provider to URL, resolved to one string by `DB_PROVIDER`; production always uses a single URL (ADR-017).
- **Data model (Phase 2, ADR-016):** `schools`, `classes`, `students`, `subjects`, `terms` and `scores` in Postgres. Every tenant table (`classes`, `students`, `scores`) carries `school_id`, and the database rejects a row whose school differs from its parent's. Score ranges (CA 0 to 40, exam 0 to 60) are enforced in the database too. At most one term is current, globally.
- A test must prove school A's token can never read school B's data, through every tool.

## 9. Evals

Evals measure how well an assistant _uses_ the tools, not just whether the tools work.

- **Dataset:** 30 to 50 prompts in JSONL, each with expected tool calls, expected answer checks computed from the synthetic dataset, and a category.
- **Categories:** discovery, lookup, ranking, ties, missing scores, ambiguity, cross-school refusal.
- **Metrics:** tool-selection accuracy, argument accuracy, answer correctness, refusal correctness, tool calls per task, latency.
- **Runs:** at least two models, a fixed dataset seed, results committed with date and model identifiers.
- **Failures are published** with analysis, and fixes (usually to tool descriptions) are recorded.

## 10. Non-functional targets

These are targets to validate in Phase 4, not claims.

| Area            | Target                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| Tool latency    | p95 under 100 ms at 10 concurrent clients on a 10,000-student dataset    |
| Correctness     | 100% of tool unit tests; cross-school isolation tests pass on every tool |
| Reproducibility | Same seed gives the same dataset, evals, and expected answers            |
| Portability     | Works over stdio and Streamable HTTP                                     |

## 11. Open questions

1. **Resolved (ADR-009):** students with any missing score are unranked, not ranked on available subjects.
2. **Resolved (ADR-009):** results are always termly, and every response states the term used. A caller may omit `term`, which means the school's current term (the term in progress), not merely the latest term that has data.
3. **Resolved (ADR-010):** grade bands are not configurable in v1. Configurable bands are a later feature.
4. **Decided (ADR-011):** no write tool in v1. Finish and polish the read-only server first, then decide after Phase 4.
