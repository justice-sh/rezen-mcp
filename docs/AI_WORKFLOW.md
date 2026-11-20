# AI Workflow

AI assistants help build this project. This document defines how, so the work stays reviewable and honest.

## Principles

1. **Humans own decisions.** AI proposes; the maintainer decides. Direction-changing choices are recorded in `docs/DECISIONS.md` only after human approval.
2. **Spec before code.** AI is given the relevant section of `docs/FEATURE_SPEC.md` and the current phase from `docs/IMPLEMENTATION_PLAN.md`, and works within them.
3. **Small slices.** One task, one commit. Large AI-generated diffs are split before review.
4. **Verified, not trusted.** Nothing merges unless `pnpm check` passes and a human has read every changed line.
5. **No sensitive input.** No secrets, real student or school data, or real database URLs are ever put into prompts.

## The loop

1. Pick the next unchecked task in the implementation plan.
2. Update the spec if behaviour changes (human reviews the spec diff first).
3. Ask the AI for tests first, or alongside the implementation.
4. Run `pnpm check`.
5. Read the full diff. Question anything surprising. Check library APIs against real documentation or the installed package, not memory.
6. Commit with a Conventional Commit message. AI-assisted commits carry the trailer `Assisted-by: Claude`.
7. Tick the task in the plan, and add a line to the plan's status log when a phase finishes.

## What AI does here

- Drafts docs, tests, scaffolding and implementations for a task.
- Suggests designs and trade-offs, and flags risks.
- Reviews diffs and spots edge cases.

## What AI does not do here

- Decide scope or accept its own work.
- Merge or push without a human running the checks and reading the diff.
- Choose or store credentials.
- Write or edit eval expectations without a human verifying the ground truth.

## Lessons log

Real corrections and surprises, added as they happen. This is where honest reporting of AI mistakes lives.

| Date       | What happened                                                                                                                                                     | What changed                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2026-11-20 | The plan assumed we might use a newer major SDK line. The npm registry showed the `latest` tag is a 1.x release.                                                  | Verified before building; recorded as ADR-002.                   |
| 2026-11-20 | Scaffold dependencies were installed at latest versions, and the toolchain was checked by running lint, typecheck, tests and build before anything was committed. | Pinned TypeScript to 5.x for a conservative toolchain (ADR-005). |
