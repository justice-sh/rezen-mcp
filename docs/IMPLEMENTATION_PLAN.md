# Implementation Plan

Phases are small enough to finish in days, and each has **exit criteria**: a phase is not done until every one is met. Target dates are planning aids, not promises. Update the status table honestly when reality differs.

## Status

| Phase | Name                                   | Target     | Status      |
| ----- | -------------------------------------- | ---------- | ----------- |
| 0     | Scaffold and docs                      | 2026-11-20 | Done        |
| 1     | Core tools                             | 2026-11-27 | Done        |
| 2     | Postgres, tenancy, auth                | 2026-12-02 | In progress |
| 3     | Eval suite                             | 2026-12-07 | Not started |
| 4     | HTTP transport, deployment, benchmarks | 2026-12-10 | Not started |
| 5     | Polish and launch                      | 2026-12-14 | Not started |

## Working agreements

- Spec first: change `docs/FEATURE_SPEC.md` **before** changing behaviour.
- One small PR (or commit) per task. Conventional Commits.
- `pnpm check` must pass before every commit to `main`.
- Decisions that change direction go in `docs/DECISIONS.md`.
- AI assistance follows `docs/AI_WORKFLOW.md`.

## How work is broken down

Feature first, then phases, then slices.

1. **Feature.** Work starts from a feature in `docs/FEATURE_SPEC.md`, written or changed before the code.
2. **Phase.** The plan groups the features into phases. Each phase has goals and exit criteria (below).
3. **Slice.** When a phase starts, it is split into slices, listed on the phase's **Slices** line, and the maintainer confirms the list before any code is written. A slice is one pull request that a person can review in one sitting: one concern, its own tests and doc updates, and it passes `pnpm check` on its own.

Rules for slices:

- **One slice at a time.** Build it, review it, merge it, and only then start the next. Never build several slices of a phase together: a correction in review would force changes in the others.
- If a review answer affects a later slice, fix only the slice under review and note which later slice will need changes. Do not pre-build it.
- After a merge, check `main` (a fresh clone, then `pnpm check`) before starting the next slice.
- Change the spec before or together with the behaviour. When plans or decisions change, update the plan (checklist, status, log) and the decision log in the same slice. Never delete an ADR: add a new one and mark the old one superseded.
- The slice list can change as a phase unfolds. Update the **Slices** line when it does.

---

## Phase 0: Scaffold and docs (done)

**Goal:** a working, tested skeleton and a written plan.

- [x] TypeScript (strict), ESLint, Vitest, build
- [x] CI workflow (lint, typecheck, tests, build)
- [x] Synthetic dataset generator (deterministic) and seed script
- [x] `Repository` interface with in-memory implementation
- [x] `list_classes` tool, tested through a real MCP client
- [x] Feature spec, implementation plan, decision log, AI workflow docs

**Exit criteria:** `pnpm check` passes locally and in CI; the server answers `tools/list` over stdio.

## Phase 1: Core tools

**Goal:** the full v1 tool surface over the in-memory repository.

- [x] Grading logic module (`src/domain/grading.ts`): totals, grades, ranking with ties, missing handling, with unit tests including edge cases
- [x] `get_class_results`
- [x] `get_student_report`
- [x] `rank_class`
- [x] `find_missing_scores`
- [x] `rezen://grading-rules` resource and `summarise_class_term` prompt
- [x] Consistent error shape for not-found and invalid-term
- [x] Each tool tested through a real MCP client

**Exit criteria:** all five tools match the spec; ties and missing scores are covered by tests; README tool table updated.

**Risks:** tool sprawl, and ambiguous descriptions. Keep each description to one or two sentences and say when to use the tool.

## Phase 2: Postgres, tenancy, auth

**Goal:** real persistence and provable school isolation.

- [x] Config flow: layered env files (ADR-013)
- [x] Database connection layer (ADR-014)
- [x] Parallel-safe test databases: one throwaway database per test file, a test-mode guard, setup and purge scripts, Postgres in CI (ADR-015)
- [x] Choose and document the data-access approach (ADR-013 config, ADR-014 Postgres access)
- [x] Schema and migrations (ADR-016)
- [x] Seed script inserts the synthetic dataset, safe to repeat; `pre-deploy` migrates then seeds (ADR-018)
- [x] `PostgresRepository` implementing `Repository`, chosen by `DATA_STORE` (ADR-019)
- [x] Repository contract tests run against both implementations (ADR-019)
- [x] Per-school tokens: issue, check and revoke, with only hashes stored (ADR-020)
- [x] School-scoped repository: one school's view, where another school's IDs look unknown (ADR-021)
- [x] Server derives the school from the token (ADR-022)
- [x] Remove the in-memory store: Postgres is the only store, and `DATA_STORE` and `SCHOOL_ID` are gone (ADR-023)
- [x] Row-level security policies as a second isolation layer: a restricted role, a policy per tenant table, and a read-only transaction per school (ADR-024)
- [x] Remove `schoolId` from tool inputs (documented breaking change; ADR-022)
- [ ] Isolation tests: school A's token against every tool and every school B ID

**Exit criteria:** isolation tests pass for every tool; the app runs against a local or hosted Postgres with no real data; `.env.example` is complete.

**Slices:** (1) Config flow: layered env files, validated schema, `cross-env` for tests. (2) Database connection layer: one `DATABASE_URL`, `DB_PROVIDER` docker or local, `docker-compose.yml`. (3) Dynamic test databases: one per test file, test-mode guard, purge script, CI Postgres. (4) Schema and migrations (Drizzle). (5) Seed and `pre-deploy` script. (6) `PostgresRepository`, contract tests, `DATA_STORE` switch. (7) Per-school tokens. (8) School-scoped repository. (9) Server derives the school from the token; `schoolId` removed from tool inputs. (10) Remove the in-memory store; Postgres only. (11) Row-level security. (12) Isolation matrix and phase close.

**Risks:** leaking existence of other schools' IDs through different error messages. Use one shared not-found error.

## Phase 3: Eval suite

**Goal:** measurable, reproducible assistant behaviour.

- [ ] Eval format and runner (`evals/`), model-agnostic
- [ ] 30 to 50 cases across all categories in the spec
- [ ] Programmatic grading against ground truth from the dataset
- [ ] Results written to `evals/results/` with date, model identifiers and dataset seed
- [ ] Run against at least two models
- [ ] Failure analysis: why each failure happened, and what was changed (usually tool descriptions)
- [ ] Re-run after fixes and record the delta

**Exit criteria:** results table in the README, including failures and what was learned.

**Risks:** evals that only show passes, and non-determinism. Record seeds and model versions, and report variance if a case is flaky.

## Phase 4: HTTP transport, deployment, benchmarks

**Goal:** a deployed remote server with measured performance.

- [ ] Streamable HTTP transport alongside stdio
- [ ] Token auth on HTTP requests
- [ ] Deployment with a documented, repeatable procedure
- [ ] Load test script with latency percentiles at several concurrency levels
- [ ] Benchmark results in `docs/BENCHMARKS.md`, with the machine and dataset size stated
- [ ] CI runs the fast suite on every PR

**Exit criteria:** the spec's non-functional targets are met, or the gap is documented with a plan.

## Phase 5: Polish and launch

**Goal:** make it easy to understand in two minutes.

- [ ] README: architecture diagram, eval results table, demo GIF
- [ ] 2-minute demo video: what it does, the eval table, what could be improved
- [ ] Contribution path verified (follow `CONTRIBUTING.md` and add a throwaway tool)
- [ ] Tag `v0.1.0` with release notes
- [ ] Retrospective in `docs/DECISIONS.md`: what changed from the plan and why

**Exit criteria:** a stranger can clone, run, and understand the project from the README alone.

---

## Status log

| Date       | Update                                                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-20 | Phase 0 complete: scaffold, one tool, CI, docs.                                                                                                                                                                                                                                     |
| 2026-11-20 | Phase 1 slice 1: grading domain logic, terms and partial scores in the dataset, extended repository.                                                                                                                                                                                |
| 2026-11-21 | Phase 1 slice 2: four tools, shared error shape, omitted term means the current term, tools tested through a real MCP client.                                                                                                                                                       |
| 2026-11-21 | Phase 1 complete: grading rules resource and summary prompt added; all five tools match the spec.                                                                                                                                                                                   |
| 2026-11-22 | Tooling: `pnpm inspector` runs the MCP Inspector against the server for manual testing in the browser (ADR-012).                                                                                                                                                                    |
| 2026-11-22 | Phase 2 slice 1: layered, validated configuration (`src/config`); `pnpm test` runs with `NODE_ENV=test` (ADR-013).                                                                                                                                                                  |
| 2026-11-22 | Phase 2 slice 2: database connection layer (`src/db`), `DB_PROVIDER` docker or local, `docker-compose.yml`, `pnpm db:check` (ADR-014).                                                                                                                                              |
| 2026-11-23 | Phase 2 slice 3: one throwaway test database per test file, test-mode guard, `test:db:setup` (run by `pnpm test`) and `test:db:purge`, Postgres in CI (ADR-015).                                                                                                                    |
| 2026-11-23 | Phase 2 slice 4: Drizzle schema and generated migrations (`src/db/schema.ts`, `drizzle/`), `pnpm db:generate` and `pnpm db:migrate` (ADR-016).                                                                                                                                      |
| 2026-11-25 | Config: `DATABASE_URL` may be a JSON map of provider to URL, resolved by `DB_PROVIDER`; production requires a single URL (ADR-017).                                                                                                                                                 |
| 2026-11-25 | Phase 2 slice 5: idempotent seed (`pnpm db:seed`, `src/db/seed.ts`) and `pnpm pre-deploy` (migrate, then seed) (ADR-018).                                                                                                                                                           |
| 2026-11-25 | Phase 2 slice 6: `PostgresRepository`, one defined order for every list, `DATA_STORE` switch, shared contract tests on both stores (ADR-019).                                                                                                                                       |
| 2026-11-25 | Phase 2 slice 7: per-school tokens (`src/auth`, `school_tokens`), `pnpm db:token` to issue, list and revoke; only hashes stored; seeding never makes tokens (ADR-020).                                                                                                              |
| 2026-11-26 | Phase 2 slice 8: school-scoped repository (`scopeToSchool`); another school's IDs look unknown on both stores; not used by the server yet (ADR-021).                                                                                                                                |
| 2026-11-26 | Phase 2 slice 9: the server serves one school, from `SCHOOL_TOKEN` (Postgres) or `SCHOOL_ID` (memory); tools read through `SchoolRepository`; `schoolId` removed (ADR-022).                                                                                                         |
| 2026-11-27 | Phase 2 slice 10: the in-memory store, `DATA_STORE` and `SCHOOL_ID` removed; Postgres is the only store and `SCHOOL_TOKEN` is always required; tests read from throwaway Postgres databases (ADR-023). Row-level security is now slice 11 and the isolation matrix slice 12.        |
| 2026-11-27 | Phase 2 slice 11: row-level security. Role `rezen_app` (read-only, no tokens), policies on `schools`, `classes`, `students` and `scores`, every query run as that role for one school; `DataStore.repositoryFor` replaces `repository` (ADR-024). The isolation matrix is slice 12. |
