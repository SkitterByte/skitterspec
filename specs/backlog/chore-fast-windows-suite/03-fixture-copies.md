---
github_issue_id: "#258"
---

# Phase 3 — Fixture copies for the slowest files ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the slowest files from phase 1 build their fixture repos once and
copy them per test. Proven by unchanged assertions and a re-measured ranking.

## Tasks

- [ ] Add `fixture(build)` to `packages/common/test/helpers/repo.js`. It
      builds into a cached template dir once per process, returns a fresh
      `cpSync` copy per call, and cleans the template up on exit.
- [ ] Check that a copied repo behaves like a built one: worktrees, absolute
      paths in `.git` files, and `core.*` config. Copy before any worktree
      exists, and re-point anything absolute.
- [ ] Move the top files from phase 1's ranking to `fixture()`, one file per
      commit, until the next file would save under 5 seconds on the VM.
- [ ] Re-measure on the VM and record the new total here.
- [ ] Tests for `fixture()` itself: isolation between copies, and cleanup.
      Run `pnpm test`, green.
