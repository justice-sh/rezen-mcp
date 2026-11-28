# rezen-mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants answer questions about school results (classes, scores, rankings, report-card data), with a tested tool surface and a reproducible eval suite.

> **Status: Phase 2 in progress (Postgres, tenancy, auth).** Phases 0 and 1 are done: the grading logic and the read-only tools work. The server reads Postgres only and serves one school, chosen by a token. See the [implementation plan](docs/IMPLEMENTATION_PLAN.md) for what's next.

> **All data in this repository is synthetic.** No real students, schools or records are used, ever.

## Why this exists

Report-card and results data is a good test bed for MCP tool design: it has real edge cases (missing scores, ties in rankings, strict per-school privacy) and clear right answers, which makes it possible to _measure_ how well an assistant uses the tools instead of guessing.

## Quick start

Requires Node 26+ (see `.nvmrc`) and [pnpm](https://pnpm.io) (the exact version is pinned in `package.json`; `corepack enable` will pick it up).

```bash
pnpm install
pnpm check        # format check + lint + typecheck + tests + build (needs a Postgres, see below)
pnpm format       # auto-format with Prettier
pnpm seed         # print a summary of the synthetic dataset
```

To run the server you need a migrated and seeded Postgres and a school token. The steps are under [Running the server](#running-the-server).

### Configuration

Configuration comes from environment variables, validated at startup. Copy `.env.example` to `.env` for local development. An optional `.env.<NODE_ENV>` (for example `.env.test`) overrides it, and real environment variables, such as those set in CI or on a hosting platform, always win. Env files are never committed. See ADR-013.

### Database

The app reads Postgres through one `DATABASE_URL`. `DB_PROVIDER` says which server is behind it: `docker` (the default) or `local`, a Postgres installed on your machine, which needs no Docker. The code behaves the same either way (ADR-014).

```bash
pnpm db:up      # docker provider: start Postgres from docker-compose.yml (port 15432)
pnpm db:check   # show which database the app uses and whether it answers
pnpm db:down    # stop the container
pnpm db:migrate # apply the migrations in drizzle/ to that database
pnpm db:seed    # insert the synthetic dataset (safe to repeat; migrate first)
pnpm pre-deploy # db:migrate, then db:seed: run it on every deploy
```

The schema lives in `src/db/schema.ts`. After changing it, run `pnpm db:generate` and commit the new file in `drizzle/` (ADR-016).

If you use both, `DATABASE_URL` can hold a URL for each provider as JSON, and `DB_PROVIDER` alone picks one. Keep the single quotes in an env file. Production must use a single URL (ADR-017):

```
DATABASE_URL='{"docker":"postgresql://rezen:rezen@localhost:15432/rezen_mcp","local":"postgresql://postgres:postgres@localhost:5432/rezen_mcp"}'
DB_PROVIDER=docker
```

`.env.example` has the values for both providers. The data is synthetic and the credentials are throwaway.

### School tokens

Each school gets its own access token. Tokens are made by a command, shown once, and stored only as a hash, so the database cannot give them away (ADR-020). Seeding never makes tokens.

```bash
pnpm db:token issue sch_demo_a --label demo   # make a token for a school; copy it now
pnpm db:token list                            # tokens without their values (--school <id> to filter)
pnpm db:token revoke <tokenId>                # stop a token from working
```

### Who is calling

The server serves **one school**, decided once when it starts, and no tool takes a school ID (ADR-022). The school is the one `SCHOOL_TOKEN` belongs to: make a token with `pnpm db:token issue`, and set it as `SCHOOL_TOKEN` in `.env` or the environment. The server will not start without a valid token, and a malformed, unknown and revoked token all give the same message. A token is checked when the server starts, so revoking one stops the next start, not a server that is already running.

Isolation has two layers. The server only reads through that school's view, and under it Postgres itself limits every query to the school: the server switches to a read-only role (`rezen_app`) and row-level security shows that role only the school's rows. That role cannot read the token table or write anything (ADR-024). `pnpm db:migrate` creates the role, and the server stops at startup with a message if it is missing.

### Running the server

Postgres is the only data store (ADR-023). There is no in-memory mode, and `DATA_STORE` and `SCHOOL_ID` no longer exist: setting either one is a configuration error that says to delete it.

```bash
pnpm db:up                           # docker provider; skip it if you use a local Postgres
pnpm pre-deploy                      # migrate and seed the database
pnpm db:token issue sch_demo_a       # copy the token it prints, and put it in .env as SCHOOL_TOKEN=...
pnpm dev                             # run the server over stdio, for the token's school
```

The server checks the database at startup and stops with a message that says what to do if it cannot be reached, has no tables, has no current term, or has no valid token.

### Tests and the test database

Tests need a Postgres. Each test file gets its own throwaway database, so files run in parallel without sharing state (ADR-015). Set it up once:

```bash
pnpm db:up            # docker provider; skip it if you use a local Postgres
# .env.test: DATABASE_URL=postgresql://rezen:rezen@localhost:15432/rezen_mcp_test
pnpm test             # creates the base test database if it is missing, then runs the tests
```

`pnpm test` and `pnpm test:watch` run `pnpm test:db:setup` first. It is safe to run repeatedly: it only creates the base test database when it is missing. `pnpm test:db:purge` drops every test database, including the base one (`pnpm test` recreates it); run it after a crashed run, and not while tests are running.

The database name must contain `test`, and `NODE_ENV` must be `test` (`pnpm test` sets it); otherwise the helpers refuse to run. CI uses a Postgres service container.

To try it with an MCP client over stdio, point the client at the built server (after the setup under [Running the server](#running-the-server)):

```bash
pnpm build
node dist/index.js
```

## Explore it in the browser

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a browser UI for trying a server by hand: list and call tools, read resources, and run prompts.

```bash
pnpm inspector
```

This starts the server from source over stdio and prints a local URL (the page opens by itself in most setups; otherwise copy the URL from the terminal). The URL contains a one-time token, so use the one printed in your own terminal. The server needs the setup under [Running the server](#running-the-server), and reads its settings (`DATABASE_URL`, `SCHOOL_TOKEN`) from `.env`. Everything runs on your machine and the data is synthetic.

Things to try:

- **Tools:** call `list_classes` (it takes no input and lists the classes of the school your token belongs to; use a token for another school to see that one), then use a returned class ID with `get_class_results` or `rank_class`.
- **Resources:** read `rezen://grading-rules`.
- **Prompts:** run `summarise_class_term`.

Press `Ctrl+C` in the terminal to stop it. The Inspector also has a CLI mode that is handy in scripts: `pnpm exec mcp-inspector --cli tsx src/index.ts --method tools/list`.

## Tools

| Tool                  | Status | Purpose                                                 |
| --------------------- | ------ | ------------------------------------------------------- |
| `list_classes`        | Done   | List your school's classes with level and student count |
| `get_class_results`   | Done   | Scores for a class and term                             |
| `get_student_report`  | Done   | One student's report-card data                          |
| `rank_class`          | Done   | Class ranking with documented tie handling              |
| `find_missing_scores` | Done   | Flag incomplete score entries                           |

Full definitions live in [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md).

### Resource and prompt

| Name                    | Kind     | Purpose                                                                 |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `rezen://grading-rules` | Resource | How totals, grades, ties and missing scores are handled                 |
| `summarise_class_term`  | Prompt   | Asks an assistant for a tool-grounded summary of a class's term results |

## Project layout

```
src/
  data/        domain types, synthetic data generator, repository interface, one school's view of it, opening the data store
  domain/      pure grading logic: totals, grades, ranking
  tools/       one file per MCP tool
  resources/   MCP resources (grading rules)
  prompts/     MCP prompt templates
  config/      layered env loading and the validated config schema
  auth/        per-school tokens: generate, hash, issue, verify, revoke; which school this server serves
  db/          Postgres connection layer (docker or local provider), schema, seed, PostgresRepository
  server.ts    builds the MCP server and registers tools
  index.ts     stdio entry point
tests/         unit tests and tests through a real MCP client
scripts/       seed, migrate and token scripts
docs/          spec, plan, decision log, AI workflow
```

## How this project is run

Work is spec-first: feature, then phases, then slices of one reviewable pull request each, built one at a time. AI assistance is used under written rules. Read:

- [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md): what we're building and what we're not
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): phases, tasks, and exit criteria
- [`docs/DECISIONS.md`](docs/DECISIONS.md): decision log (ADRs)
- [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md): how AI is used, and how it is kept honest

## License

MIT
