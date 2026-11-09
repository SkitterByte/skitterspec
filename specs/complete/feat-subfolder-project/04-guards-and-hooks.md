---
github_issue_id: "#144"
---

# Phase 4 — Guards and hooks ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the main guard and review gate fire in a nested project exactly as at
the root — proven by refusal tests plus stays-silent tests.

## Tasks

- [x] env/mainguard.js: compare the target's `--show-toplevel` against the
      primary **root** (decision 6), read the base branch there, and keep the
      allow file in the project folder. Proven fail-open before the fix: the
      nested hook suite failed 5 tests against the old guard
- [x] Review-gate hook / `review gate --for-command`: "inside the spec's own
      worktree" already tests the worktree root, so a session in
      `<wt>/<prefix>` is inside it — no change, now covered nested
- [x] `findEngine` in both hooks: finds the bin with `node_modules` in the
      subfolder or at the repo root above it, the nearer winning;
      `CLAUDE_PROJECT_DIR` / payload `cwd` is the subfolder
- [x] Tests: `main-guard-hook` and `env-review-hook` suites moved onto the
      helper (both layouts), plus a sibling-write deny case (`Sql/` on main);
      `hooks-find-engine.test.js` for both hooks incl. a stays-silent
      fallback. Full suite 4614 green, `test:nested` 152 green (11 files)

## Notes

`findEngine` walks UP, so an install BELOW the project folder (say an Angular
`ClientApp/node_modules`) is not found and the hooks fall back to the
`skitterspec` on PATH — fail-open, as every cannot-tell is. Phase 6 documents
where to install.
