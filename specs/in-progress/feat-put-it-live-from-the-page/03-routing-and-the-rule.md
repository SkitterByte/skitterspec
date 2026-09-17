---
linear_issue_id: "SKS-327"
---

# Phase 3 — The skills route it, the rule holds the shape ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-diff` owns the action's routing, every skill that waits picks it
up for free, and `.claude/rules/spec-reports.md` carries the banner's `live:`
line with the reason it was amended in.

## Tasks

- [ ] Add the action to `/spec-diff` §2's routing, beside the verdicts, as the
      one ending that **loops back**: `live-on` → hand off to
      `review.commitWith` with the render's pathspec, then `live take`, then
      re-render `--branch` and **wait again**; `live-off` → `live release`, then
      re-render and wait again.
- [ ] State plainly there that the gate is **untouched** by either — the commit
      is a precondition and the action is not a verdict, so a phase that ended
      still owes one (decisions 2 and 3).
- [ ] Stop on a refusal: relay the engine's reason, re-render, and wait again.
      Never park another spec's hold, never `--force` anything.
- [ ] Amend `spec-reports.md`'s banner to carry one `live:` line, with the
      reason recorded beside the tier-stack amendment: a reader deciding whether
      to open the page wants to know whether it is already running.
- [ ] Point `/spec-next`, `/spec-bug` and `/spec-hotfix` at that rule rather
      than giving each its own copy of the line — the lesson from the tier
      stack, where six skills had each grown their own version.
- [ ] Tests: the rule names the line and its reason; `/spec-diff` routes both
      actions and says the gate is untouched; no skill inlines a competing
      shape.
- [ ] **Stays-silent test**: an `unavailable` state emits **no** `live:` line in
      the banner, so a project without isolation sees no trace of a feature it
      does not have.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Doing the rule last is the same call the tier-stack spec made, for the same
reason: the rule should describe a shape that already exists and has been used
rather than one still being designed.

The `live:` line is the second amendment to a deliberately rigid contract in two
specs. That is worth watching — the contract earns its rigidity from real
failures, and two amendments in a row is how a rigid contract quietly becomes a
negotiable one. Each has carried its reason; a third should have to argue harder.
