---
github_issue_id: "#95"
---

# Phase 2 — Skills stop storing status; buckets as code facts; board-owned assignee ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** with `pull` configured, no lifecycle skill writes `Status:`,
`Developer:` or State-log rows, buckets move only on code events, and the
assignee is the board's. With `push` or no provider, behaviour is unchanged.

## Tasks

- [x] `/spec`, `/spec-bug`, `/spec-hotfix`: under `pull`, write
      `> **Tracker:** <link>` (stamped after linking) in place of `Status:` /
      `Developer:` / State log. A transition push sets the initial state.
- [x] `/spec-start`: move the bucket (code fact: a branch exists), push the
      in-progress transition, and run `assign --if-unassigned`. No header or
      State-log write under `pull`.
- [x] `/spec-next`: stop touching the parent's state. Sub-issue (phase) status
      stays `push`.
- [x] `/spec-complete` / `/spec-cancel`: move the bucket, push the transition,
      and release the assignee per today's rule under `push`. Under `pull` the
      board keeps the assignee (phase 1 stopped projecting it), and there is no
      header or State-log write. Under `land.strategy: "pr"` the complete transition rides
      run 2 (host merged) only — run 1 pushes no state; `/spec-cancel`'s PR
      abandon is unchanged.
- [x] `/spec-claim` (all four providers): a tracker write. Drop the frontmatter
      stamp and the follow-up push under `pull`.
- [x] Read "Draft" from a non-empty Open questions section where a skill needs it
      (`/spec-start`'s sanity check).
- [x] Mirror every skill edit into the `packages/skitterspec*` dist copies through
      the existing build, not by hand.
- [x] Tests: skill-text and CLI tests for both modes. Under `push`, every
      existing output is unchanged (a stays-silent test for the base). Run
      `pnpm test` — green.

## Notes

- **The skills ask, through one new seam.** The base skills are tracker-free, so
  they cannot read `fieldOwnership`. `spec-sync ownership [--json]` (a kit
  function, wired into all four providers) answers it, and a
  `spec-status-owner` seam placed before every header write tells the skill what
  to skip under `pull`. The base distribution fills the seam with nothing, so a
  repo with no tracker is unchanged, and a test pins that.
- **Eight skills, not seven.** `/spec-incident` landed meanwhile and writes the
  same headers, and `/spec-review`'s knock-back to Draft writes `Status:` and a
  State log row. Both carry the seam. Under `pull` a reason a header would have
  carried goes in the Changelog.
- **`/spec-next` needed no edit.** It never writes the parent's state, and phase
  1's engine sends that state only on a bucket move, which `/spec-next` never
  makes.
- **PR run 2 lives in the sync seam**, for all four providers: the push is
  skipped on run 1 even where the `branch` lane moved the folder to ride the PR.
- **`ownership` is already documented** on all four provider pages, because
  `docs-claims.test.js` refuses an undocumented verb. The rest of the docs pass
  is still phase 4.
