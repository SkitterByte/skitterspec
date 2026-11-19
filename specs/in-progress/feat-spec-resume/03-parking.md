---
github_issue_id: "#244"
---

# Phase 3 — Parking: `/spec-park`, planned blockers, `/spec-next` and `/spec-complete` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a spec can be parked ad hoc or by plan, and the lifecycle skills
respect the blocker without being locked by it. Proven by engine tests on the
gate answer plus the skill-content tests.

## Tasks

- [x] Write `/spec-park "<reason>" [--until YYYY-MM-DD] [--phase N]`: write the
      header to the overview, or to phase N's file, then commit it
      pathspec-bounded on the spec's branch and report
      `Next: /spec-resume <name>`. The worktree is kept. Parking a spec that is
      not in-progress refuses.
- [x] `/spec` Phase A: ask whether any phase waits on something outside the
      repo (a deploy, another project's release, a soak period), and write
      that phase file's `Blocked on:` header.
- [x] `/spec-next`: before building, if the next phase (or the spec) has an
      uncleared blocker, emit `⏸` naming it with `Next: /spec-resume <name>`.
      No bypass offer, since `/spec-resume` is the exit.
- [x] `/spec-complete`: list uncleared blockers in `Notes` and never refuse
      over them.
- [x] Add `Blocked on:` to the header-field list in `spec-planning.md`,
      including how it differs from `Waits on:`.
- [x] Tests: the engine answer `/spec-next` asks reports a blocked phase. A
      blocked phase *later* than the next one stays silent (stays-silent case).
      Run `pnpm test`, green.

## Notes

- `/spec-next` asks `spec-env resume <spec> --json` for `blocking`, the line
  that holds the first unfinished phase: the spec's own, or that phase's. A
  line on a later phase leaves it null, so a planned phase-4 wait never stops
  phases 1–3.
- `spec-env resume` with no argument now resolves the worktree you are
  standing in, so `/spec-park` can be typed bare.
