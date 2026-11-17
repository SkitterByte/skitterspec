---
github_issue_id: "#215"
---

# Phase 5 — `/spec-todo` line and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The morning report counts waiting ideas for the home project, and
the docs describe the feature.

## Tasks

- [ ] Make `packages/common/src/tada/todo.js` read `idea list --count --json`
      for the home project only and print `N ideas waiting` when N > 0.
      Print nothing on 0, an error or a timeout.
- [ ] Update `docs/reference.html`, `github.html`, `linear.html` and
      `azure-boards.html`, and bump each page's `verified:`.
- [ ] Tests: the count line appears when N > 0. Stays-silent cases: zero
      ideas, and the probe failing. Run `node scripts/docs-freshness.js
      check`, then `pnpm test`. Both must be green.
