---
github_issue_id: "#95"
---

# Phase 2 — Skills stop storing status; buckets as code facts; board-owned assignee ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** with `pull` configured, no lifecycle skill writes `Status:`,
`Developer:` or State-log rows, buckets move only on code events, and the
assignee is the board's. With `push` or no provider, behaviour is unchanged.

## Tasks

- [ ] `/spec`, `/spec-bug`, `/spec-hotfix`: under `pull`, write
      `> **Tracker:** <link>` (stamped after linking) in place of `Status:` /
      `Developer:` / State log. A transition push sets the initial state.
- [ ] `/spec-start`: move the bucket (code fact: a branch exists), push the
      in-progress transition, and run `assign --if-unassigned`. No header or
      State-log write under `pull`.
- [ ] `/spec-next`: stop touching the parent's state. Sub-issue (phase) status
      stays `push`.
- [ ] `/spec-complete` / `/spec-cancel`: move the bucket, push the transition,
      and release the assignee per today's rule. No header or State-log write
      under `pull`. Under `land.strategy: "pr"` the complete transition rides
      run 2 (host merged) only — run 1 pushes no state; `/spec-cancel`'s PR
      abandon is unchanged.
- [ ] `/spec-claim` (all four providers): a tracker write. Drop the frontmatter
      stamp and the follow-up push under `pull`.
- [ ] Read "Draft" from a non-empty Open questions section where a skill needs it
      (`/spec-start`'s sanity check).
- [ ] Mirror every skill edit into the `packages/skitterspec*` dist copies through
      the existing build, not by hand.
- [ ] Tests: skill-text and CLI tests for both modes. Under `push`, every
      existing output is unchanged (a stays-silent test for the base). Run
      `pnpm test` — green.
