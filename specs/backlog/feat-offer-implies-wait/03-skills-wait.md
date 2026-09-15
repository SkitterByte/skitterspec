---
linear_issue_id: "SKS-276"
---

# Phase 3 — The skills that offer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every skill that asks for a verdict waits for it — `/spec-bug` and
`/spec-hotfix` by arming and waiting like `/spec-next`, `/spec-diff` by waiting
with the `Continue` set — and no skill asks without waiting.

## Tasks

- [ ] `/spec-bug` §5b: arm the gate, render, then wait, reusing `/spec-next`'s
      sequence by reference rather than restating it. Drop the `Review` row from
      its `## Report` fields in favour of the banner.
- [ ] `/spec-hotfix`: the same, at its equivalent step.
- [ ] `/spec-next`: its non-waiting fallback row loses the question; where the
      run is mid-phase, offer `Continue`.
- [ ] `/spec-diff`: wait on the pass it renders, with the mid-run button set when
      the work is unfinished. Leave §0's rule untouched — nothing here claims a
      pass it was not asked to.
- [ ] Check no other skill renders a page and finishes:
      `grep -l "spec-env review" assets/skills/*/SKILL.md` (today: `spec-bug`,
      `spec-diff`, `spec-hotfix`, `spec-start`, `spec-reviewed`, `spec-next` —
      `spec-start` only stands the server up and is out of scope).
- [ ] Test: extend `assets-phase-end-review.test.js` so every skill that renders
      a page also waits — asserted over the **set** of skills, not per skill, so
      a new one cannot quietly opt out. This is the guard that would have caught
      the original gap.
- [ ] Test (stays-silent): `/spec-start`, which stands the server up without
      rendering an offer, is not accused by that assertion.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`/spec-bug` and `/spec-hotfix` arming is the user-visible half of this spec: a
`git commit` in that worktree will refuse until a verdict is sent or
`spec-env review skip "<reason>"` is run. Call it out in `MIGRATION.md` when this
ships.
