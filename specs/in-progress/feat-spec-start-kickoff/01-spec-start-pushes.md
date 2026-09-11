---
linear_issue_id: "SKS-149"
---

# Phase 1 — `/spec-start` pushes the state change it makes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-start` mirrors the spec move and the assignee to the tracker
itself, instead of leaving it to a `/spec-next` refresh that may never come.

## Tasks

- [x] In `packages/linear/assets/seams`, add the push to the `spec-start` seam:
      a new `spec-tracker-start.md` fragment that runs `/spec-push`, the same way
      `/spec-next` and `/spec-complete` already refresh.
- [x] Make it best-effort and non-blocking, matching the assignment seam beside
      it — an unreachable tracker reports one line and the skill carries on.
- [x] Rewrite the "Why this skill links nothing, but does record an owner"
      section in `packages/common/assets/skills/spec-start/SKILL.md`: the
      no-push rationale is now wrong, and the replacement says why the two
      pushes are not duplicates (issue state + assignee here; phase 1 starting
      there).
- [x] Place the push **before** the commit, so the snapshot it writes is swept up
      by the spec's own commit rather than stranded in the worktree. (Corrected
      from the original task, which had this backwards — see the Changelog.)
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

This phase is independently valuable and deliberately first: it closes the
half-state today, whether or not the continuation in phases 3–4 ever lands.

The seam is provider-side, so the base distribution composes it to nothing and a
tracker-free project sees no change at all.

**Why a new fragment rather than reusing `spec-tracker-sync`.** Sync devotes a
whole bullet to there being no unassign step, because the bucket a spec moves
*into* is what releases the issue. The bucket entered here is `in-progress/`,
where the push *takes* the assignment — composing sync in would have shipped
exactly backwards prose. This is the same reason `spec-tracker-progress` exists
separately, and its header comment says so.
