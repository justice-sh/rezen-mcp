# Implementation Plan

Phases are small enough to finish in days, and each has **exit criteria**: a phase is not done until every one is met. Target dates are planning aids, not promises. Update the status table honestly when reality differs.

## Status

| Phase | Name                                   | Target     | Status      |
| ----- | -------------------------------------- | ---------- | ----------- |
| 0     | Scaffold and docs                      | 2026-11-20 | Done        |
| 1     | Core tools                             | 2026-11-27 | In progress |
| 2     | Postgres, tenancy, auth                | 2026-12-02 | Not started |
| 3     | Eval suite                             | 2026-12-07 | Not started |
| 4     | HTTP transport, deployment, benchmarks | 2026-12-10 | Not started |
| 5     | Polish and launch                      | 2026-12-14 | Not started |

## Working agreements

- Spec first: change `docs/FEATURE_SPEC.md` **before** changing behaviour.
- One small PR (or commit) per task. Conventional Commits.
- `pnpm check` must pass before every commit to `main`.
- Decisions that change direction go in `docs/DECISIONS.md`.
- AI assistance follows `docs/AI_WORKFLOW.md`.

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
- [ ] `rezen://grading-rules` resource and `summarise_class_term` prompt
- [x] Consistent error shape for not-found and invalid-term
- [x] Each tool tested through a real MCP client

**Exit criteria:** all five tools match the spec; ties and missing scores are covered by tests; README tool table updated.

**Risks:** tool sprawl, and ambiguous descriptions. Keep each description to one or two sentences and say when to use the tool.

## Phase 2: Postgres, tenancy, auth

**Goal:** real persistence and provable school isolation.

- [ ] Choose and document the data-access approach (ADR)
- [ ] Schema and migrations; seed script inserts the synthetic dataset
- [ ] `PostgresRepository` implementing `Repository`
- [ ] Repository contract tests run against both implementations
- [ ] Per-school tokens; server derives school from the token
- [ ] Row-level security policies as a second isolation layer
- [ ] Remove `schoolId` from tool inputs (documented breaking change)
- [ ] Isolation tests: school A's token against every tool and every school B ID

**Exit criteria:** isolation tests pass for every tool; the app runs against a local or hosted Postgres with no real data; `.env.example` is complete.

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

| Date       | Update                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-20 | Phase 0 complete: scaffold, one tool, CI, docs.                                                                               |
| 2026-11-20 | Phase 1 slice 1: grading domain logic, terms and partial scores in the dataset, extended repository.                          |
| 2026-11-21 | Phase 1 slice 2: four tools, shared error shape, omitted term means the current term, tools tested through a real MCP client. |
