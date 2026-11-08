---
github_issue_id: "#127"
---

# Phase 4 — Progress: block text and native fields ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the ticket shows how far along the work is, from the spec's own
checkboxes, in the block always and in a native field where configured.

## Tasks

- [x] sync-core: pure `progressOf(phases)` → `{ ticked, total, percent,
      phase, phases }`; no checkboxes → `null` (no progress line, never `0%`).
      Only `x` counts as done; nested boxes count once each; `phase` is the
      first in progress, else the first not done, else the last
- [x] Render `62% · phase 3 of 4` in the spec block and `n of m tasks` in each
      sub-issue block
- [x] Native field: GitHub only — `summary.progressField` names a board
      Number field (`setNumberField`, via a new optional `afterIssue` op in the
      shared apply skeleton). A missing or non-number field is one line, never
      a failure. Linear, Jira and Azure native fields not wired (no test
      access); see Notes
- [x] Tests: progress maths (no tasks, all ticked, nested and wrapped
      boxes, non-`x` marks); block lines; GitHub field written, skipped with a
      reason, and silent when unconfigured; adapter mutation shape.
      `pnpm test`: 4520 passed

## Notes

The `afterIssue` op is the seam for the other trackers' native fields: a
provider implements it and the skeleton reports its line, never failing the
push on it.
