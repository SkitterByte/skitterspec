---
github_issue_id: "#213"
---

# Phase 3 — GitHub idea seam ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** With GitHub configured, ideas are issues labelled `idea` that are
kept off the board, and `/spec #N` adopts them through the existing Phase 0.

## Tasks

- [x] Add `intake.ideaLabel` (default `idea`) to `packages/github/src/config.js`.
- [x] Register an idea store (`setProviderIdeaStore({ supports: true, run })`)
      in the GitHub bin, backed by `spec-sync idea add|list|drop`. `add` creates the issue
      with the label and **no** project item. `list` shows open labelled
      issues minus `linked`. `drop` closes the issue as not planned with the
      reason as a comment. Print the MCP fallback for each, as `intake` does.
- [x] Make sure Phase 0 bug/hotfix routing ignores `ideaLabel`.
- [x] Tests: run add/list/drop against the adapter fake, check that no
      project item is created, that adopted ideas are excluded from `list`,
      and that a missing token prints the MCP plan and exits 0. Run `pnpm test`. It must be green.

## Notes

- Without the API, `idea add` and `idea drop` refuse with exit 1, printing
  the MCP plan and handing the text back. A write that did not happen must
  not look like one that did. `idea list` degrades to one line, exits 0 and
  reports `count: null`.
- "Routing ignores `ideaLabel`" is implemented by keeping ideas out of the
  intake listing: with `intake.label` unset, intake lists every open issue,
  and that would include each idea.
- `drop` refuses an issue that doesn't carry the idea label, so a mistyped
  number can't close a real ticket.
- Added the `.claude/skills/spec-idea` link that phase 2 missed (`pnpm
  relink`).
