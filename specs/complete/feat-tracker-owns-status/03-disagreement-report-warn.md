---
github_issue_id: "#96"
---

# Phase 3 — Disagreement: report, warn, offer cleanup ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** when the board says Cancelled or Done and the repo hasn't caught up,
the people who hold the branch hear about it, and nobody is made to sync.

## Tasks

- [x] `spec-sync list`: reword `specColumn` (`provider-kit/src/list-rows.js`)
      around code facts. A board Cancelled/Done against an `in-progress` bucket
      shows `≠` with the cleanup (`/spec-cancel` · `/spec-complete`). A board
      Ready/Blocked against `backlog` is **not** a disagreement.
- [x] `/spec-status`: the same reading for one spec.
- [x] `/spec-start` and `/spec-next` pre-flight: one warning line when
      `readStatus` says Cancelled/Done, then carry on. They never refuse.
- [x] The cleanup is offered, never inferred, and only to the operator holding
      that worktree. Someone else's branch is reported, not offered
      (`offered-unblocks.md`).
- [x] Tests: a mismatch is reported; cannot-tell, an unmapped state and a board
      Ready on a backlog spec all say nothing (stays-silent tests). Run
      `pnpm test` — green.

## Notes

- **One rule, in `boardDisagreement`** (`provider-kit/src/list-rows.js`): a
  board Done/Cancelled against a `backlog`/`in-progress` bucket, and nothing
  else. Done on an in-flight spec names `/spec-complete`; every other pairing
  names `/spec-cancel`, since an unstarted spec has nothing to complete. It
  applies under `push` too. Buckets are code facts in both modes, and the old
  any-mismatch `≠` flagged a board doing its job.
- **A new verb, `spec-sync board <spec>`**, on all four providers. It is silent
  unless the rule fires, and `--json` always answers. `/spec-start` and
  `/spec-next` call it from their seams, and `/spec-status` from a new §3c.
  `/spec-sync` routes it, and the four provider pages document it (the
  docs-claims tests require both).
- **Named, never offered.** The engine declares no `offer`. The pre-flight warns
  and carries on, because that session holds the branch and the choice is
  theirs. `/spec-status` only reports, because the branch may be someone else's.
- `/spec-next`'s assignee backfill takes `--if-unassigned` under `pull`.
  Without it, the backfill would have overwritten whoever the board names.
- A review-server timing test (`env-review-reader`) failed once under full-suite
  load, then passed 3/3 alone and on a full rerun. It is unrelated to this phase.
