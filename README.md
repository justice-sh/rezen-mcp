# rezen-mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants answer questions about school results (classes, scores, rankings, report-card data), with a tested tool surface and a reproducible eval suite.

> **Status: Phase 0 complete (scaffold).** One tool works end to end. See the [implementation plan](docs/IMPLEMENTATION_PLAN.md) for what's next.

> **All data in this repository is synthetic.** No real students, schools or records are used, ever.

## Why this exists

Report-card and results data is a good test bed for MCP tool design: it has real edge cases (missing scores, ties in rankings, strict per-school privacy) and clear right answers, which makes it possible to _measure_ how well an assistant uses the tools instead of guessing.

## Quick start

Requires Node 26+ (see `.nvmrc`) and [pnpm](https://pnpm.io) (the exact version is pinned in `package.json`; `corepack enable` will pick it up).

```bash
pnpm install
pnpm check        # format check + lint + typecheck + tests + build
pnpm format       # auto-format with Prettier
pnpm dev          # run the server over stdio
pnpm seed         # print a summary of the synthetic dataset
```

To try it with an MCP client over stdio, point the client at the built server:

```bash
pnpm build
node dist/index.js
```

## Tools

| Tool                  | Status | Purpose                                              |
| --------------------- | ------ | ---------------------------------------------------- |
| `list_classes`        | Done   | List a school's classes with level and student count |
| `get_class_results`   | Done   | Scores for a class and term                          |
| `get_student_report`  | Done   | One student's report-card data                       |
| `rank_class`          | Done   | Class ranking with documented tie handling           |
| `find_missing_scores` | Done   | Flag incomplete score entries                        |

Full definitions live in [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md).

## Project layout

```
src/
  data/        domain types, synthetic data generator, repository interface
  domain/      pure grading logic: totals, grades, ranking
  tools/       one file per MCP tool
  server.ts    builds the MCP server and registers tools
  index.ts     stdio entry point
tests/         unit tests and tests through a real MCP client
scripts/       seed script
docs/          spec, plan, decision log, AI workflow
```

## How this project is run

Work is spec-first and phase-based, and AI assistance is used under written rules. Read:

- [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md): what we're building and what we're not
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): phases, tasks, and exit criteria
- [`docs/DECISIONS.md`](docs/DECISIONS.md): decision log (ADRs)
- [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md): how AI is used, and how it is kept honest

## License

MIT
