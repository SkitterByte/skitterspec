---
github_issue_id: "#213"
---

# Phase 3 — GitHub idea seam ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** With GitHub configured, ideas are issues labelled `idea` that are
kept off the board, and `/spec #N` adopts them through the existing Phase 0.

## Tasks

- [ ] Add `intake.ideaLabel` (default `idea`) to `packages/github/src/config.js`.
- [ ] Add `spec-sync idea --supports|add|list|drop`. `add` creates the issue
      with the label and **no** project item. `list` shows open labelled
      issues minus `linked`. `drop` closes the issue as not planned with the
      reason as a comment. Print the MCP fallback for each, as `intake` does.
- [ ] Make sure Phase 0 bug/hotfix routing ignores `ideaLabel`.
- [ ] Tests: run add/list/drop against the adapter fake, check that no
      project item is created, that adopted ideas are excluded from `list`,
      and that a missing token prints the MCP plan and exits 0. Run `pnpm test`. It must be green.
