---
github_issue_id: "#96"
---

# Phase 3 — Disagreement: report, warn, offer cleanup ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** when the board says Cancelled or Done and the repo hasn't caught up,
the people who hold the branch hear about it, and nobody is made to sync.

## Tasks

- [ ] `spec-sync list`: reword `specColumn` (`provider-kit/src/list-rows.js`)
      around code facts. A board Cancelled/Done against an `in-progress` bucket
      shows `≠` with the cleanup (`/spec-cancel` · `/spec-complete`). A board
      Ready/Blocked against `backlog` is **not** a disagreement.
- [ ] `/spec-status`: the same reading for one spec.
- [ ] `/spec-start` and `/spec-next` pre-flight: one warning line when
      `readStatus` says Cancelled/Done, then carry on. They never refuse.
- [ ] The cleanup is offered, never inferred, and only to the operator holding
      that worktree. Someone else's branch is reported, not offered
      (`offered-unblocks.md`).
- [ ] Tests: a mismatch is reported; cannot-tell, an unmapped state and a board
      Ready on a backlog spec all say nothing (stays-silent tests). Run
      `pnpm test` — green.
