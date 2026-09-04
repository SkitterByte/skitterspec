---
linear_issue_id: "SKS-43"
---

# Phase 2 — State diffs independently of description ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** editing a completed spec's prose no longer re-asserts its workflow
state, and a deployed spec sitting on a declared stage stops being reported as
drift.

## Tasks

- [ ] Split `specIssueHash` in `packages/sync-core/src/compare.js` so
      `description` and `state` hash separately, and record both in
      `snapshotOf`.
- [ ] Emit `plan.issue` per changed field — `{description}` alone,
      `{state}` alone, or both. `isEmptyPlan` must still read named fields.
- [ ] Back-compat: a snapshot carrying only the old combined hash reads as
      **unknown** and falls back to today's welded behaviour for exactly one
      push, which rewrites it in the new shape. No migration step.
- [ ] Confirm `applyOneSpec` handles a `plan.issue` with no `state` — the
      pre-resolve loop and `withoutNull` already tolerate it; add the test rather
      than assume.
- [ ] Teach `bucketForState` (`normalize.js`) that a declared stage state maps to
      the bucket it descends from, so local and remote compare equal.
- [ ] Change the `spec-sync status` drift line (`cli-sync.js:479`) to report a
      declared stage as **position** ("Linear: On Test — deployed past complete"),
      reserving "drift" for a genuinely unrecognised state.
- [ ] Tests: a description-only edit on a completed spec produces a plan with
      **no** state; a bucket move still writes state; the `/spec-complete`
      handoff push still writes `states.complete`; an old-shape snapshot
      self-heals in one push; **a spec parked on `On Test` reports no drift**
      (the stays-silent case); an unrecognised state still reports drift.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The `/spec-complete` handoff is the case most likely to break here: the push that
moves a spec into `complete` **must** still write `states.complete`, because the
snapshot then says `in-progress`. That transition and the later prose edit differ
only in what the snapshot holds, which is exactly why the state needs its own
hash rather than a bucket test.

This phase is worth shipping even if the rest of the spec is abandoned — push
re-asserting state on every prose edit is a bug independent of any ladder.
