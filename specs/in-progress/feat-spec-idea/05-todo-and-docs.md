---
github_issue_id: "#215"
---

# Phase 5 — `/spec-todo` line and docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The morning report counts waiting ideas for the home project, and
the docs describe the feature.

## Tasks

- [x] Make `packages/common/src/tada/todo.js` read `idea list --count --json`
      for the home project only and print `N ideas waiting` when N > 0.
      Print nothing on 0, an error or a timeout.
- [x] Add `packages/common/src/idea*.js` to `docs/reference.html` `covers`; update `docs/reference.html`, `github.html`, `linear.html` and
      `azure-boards.html`, and bump each page's `verified:`.
- [x] Tests: the count line appears when N > 0. Stays-silent cases: zero
      ideas, and the probe failing. Run `node scripts/docs-freshness.js
      check`, then `pnpm test`. Both must be green.

## Notes

- The count is read in-process, through `skitterspec idea list --count
  --json`, with a 5-second bound. The provider store now takes the caller's
  output stream (`run(sub, argv, { cwd, out })`), so the count never prints
  onto the report.
- `verified:` was bumped on github, linear, azure-boards and jira: every
  commit since their last check was this spec's own or a release bump.
  `index.html` and `reference.html` were left alone, because they are also
  behind `d2e25b39` (afterSwitch), which this spec did not check.
- Added a short "Jira keeps ideas in `specs/ideas.md`" line to
  `docs/jira.html`.
