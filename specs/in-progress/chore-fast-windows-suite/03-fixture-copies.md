---
github_issue_id: "#258"
---

# Phase 3 — Fixture copies for the slowest files ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the slowest files from phase 1 build their fixture repos once and
copy them per test. Proven by unchanged assertions and a re-measured ranking.

## Tasks

- [x] Add `scripts/spawn-census.js`, a `--require` hook that logs every
      subprocess by kind and duration, and record the suite's census (18,100
      spawns on the Mac at `60bb693d`).
- [x] Add `fixture(build)` to `packages/common/test/helpers/repo.js`. It
      builds into a cached template dir once per process, returns a fresh
      `cpSync` copy per call, and cleans the template up on exit.
- [x] Check that a copied repo behaves like a built one: worktrees, absolute
      paths in `.git` files, and `core.*` config. Copy before any worktree
      exists, and re-point anything absolute.
- [~] Move the top files from phase 1's ranking to `fixture()`, one file per
      commit, until the next file would save under 5 seconds on the VM. Count
      spawns saved with the census, alongside time.
- [~] Re-measure on the VM and record the new total here.
- [x] Tests for `fixture()` itself: isolation between copies, and cleanup.
      Run `pnpm test`, green.

## Notes

- `fixture(name, build)` keys templates by `build`'s arguments, and copies the
  root plus any `-wt` folder. `repoint` rewrites every file where git keeps an
  absolute path (`.git` files, each git dir's `config`, `worktrees/*/gitdir`),
  so worktrees and a bare remote under root both belong to the copy.
- Converted: `cli-spec-env-integrate` (787 → 571 spawns), `cli-spec-env-live`
  (847 → 541) and `cli-spec-env-hotfix-land` (704 → 584).
- **Stopped short of the stopping rule, deliberately (2026-11-19).** The whole
  suite went from 18,100 to 17,491 spawns, which is only 3.4%. Even in the
  converted files the engine's own repeated reads outnumber the scaffold, so
  each further conversion saves less than phase 4 will across all of them.
  The remaining 85 hand-rolled scaffolds are re-ranked after phase 4. Phase 5
  converts whatever still clears the 5-second bar, and takes the VM
  measurement this phase skipped (the census stands in for it here).
