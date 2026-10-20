---
linear_issue_id: "SKS-397"
---

# Phase 2 — `up` / `nospec` print the verb, not the shell ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no planner output contains runnable worktree shell. Proven by output
tests asserting the single `bootstrap` line and the absence of `.env` text.

## Tasks

- [x] `spec-env up`: replace the `then, in the worktree, run:` block with
      `then, run:` + `skitterspec spec-env bootstrap <name>` (`--docs` when
      planned so); omit it when there are no steps
- [x] `spec-env nospec`: same, for its setup list
- [x] Remove `seedCommandFor`, `envFileCommandFor` and the string step fields
      from `planUp`; keep `worktreeCd` only where still used
- [x] Migrate `env-provision*.test.js`, `env-seed.test.js`,
      `cli-spec-env-nospec.test.js` to the step data / new output
- [x] Test: `up` output for a seeded docker spec names no `.env` path and no
      `ln -s` / `cp`
- [x] Run `pnpm test` — green before the phase is done
