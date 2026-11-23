# Contributing

Thanks for taking a look. This project is intentionally small and spec-driven.

1. Read [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md) and [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
2. Open an issue before large changes, so scope stays aligned with the spec.
3. Run `pnpm check` before opening a PR (format check, lint, typecheck, tests, build). `pnpm format` fixes formatting. Tests need a Postgres: see "Tests and the test database" in the README.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
5. Never include real student or school data, secrets or real database URLs. All data here is synthetic.

## Adding a new tool

1. Add the tool to the spec (`docs/FEATURE_SPEC.md`): purpose, input, output, errors.
2. Add repository methods behind the `Repository` interface if new data is needed.
3. Implement it in `src/tools/<tool-name>.ts` and register it in `src/server.ts`.
4. Add tests that call it through a real MCP client (see `tests/list-classes.test.ts`).
5. Add eval cases for it once the eval suite exists (Phase 3).
6. Keep the tool description short and unambiguous. Models choose tools from descriptions.
