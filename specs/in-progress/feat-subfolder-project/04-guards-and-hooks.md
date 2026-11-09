---
github_issue_id: "#144"
---

# Phase 4 — Guards and hooks ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the main guard and review gate fire in a nested project exactly as at
the root — proven by refusal tests plus stays-silent tests.

## Tasks

- [ ] env/mainguard.js: compare the target's `--show-toplevel` against the
      primary **root** (decision 6), so a nested project no longer fails open
- [ ] Review-gate hook / `review gate --for-command`: "inside the spec's own
      worktree" tests the worktree root, from a session standing in
      `<wt>/<prefix>`
- [ ] `findEngine` in both hooks: verify it finds the bin with `node_modules` in
      the subfolder and above it; `CLAUDE_PROJECT_DIR` is the subfolder
- [ ] Tests: guard refuses a nested write on base (in the prefix and in `Sql/`);
      stays-silent in a worktree, on a feature branch, and with no config;
      gate refuses in the nested worktree, silent on base; typecheck + test +
      `test:nested` green
