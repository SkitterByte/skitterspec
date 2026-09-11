---
linear_issue_id: "SKS-149"
---

# Phase 1 — `/spec-start` pushes the state change it makes ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-start` mirrors the spec move and the assignee to the tracker
itself, instead of leaving it to a `/spec-next` refresh that may never come.

## Tasks

- [ ] In `packages/linear/assets/seams`, add the push to the `spec-start` seam
      that follows step 4's commit: run `/spec-push`, the same way `/spec-next`
      and `/spec-complete` already refresh.
- [ ] Make it best-effort and non-blocking, matching the assignment seam beside
      it — an unreachable tracker reports one line and the skill carries on.
- [ ] Rewrite the "Why this skill links nothing, but does record an owner"
      section in `packages/common/assets/skills/spec-start/SKILL.md`: the
      no-push rationale is now wrong, and the replacement should say why the two
      pushes are not duplicates (issue state + assignee here; phase 1 starting
      there).
- [ ] Confirm the push lands **after** the commit, so the snapshot it writes is
      already committed rather than left dirty (the existing step 4 ordering
      note).
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

This phase is independently valuable and deliberately first: it closes the
half-state today, whether or not the continuation in phases 3–4 ever lands.

The seam is provider-side, so the base distribution composes it to nothing and a
tracker-free project sees no change at all.
