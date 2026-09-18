---
linear_issue_id: "SKS-306"
---

# Phase 2 — Teardown says what it is about to strand ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-complete` and `/spec-cancel` name a pass still waiting for the
spec they are finishing, before the teardown they already confirm — so the last
moment a verdict can be honoured is not passed silently.

## Tasks

- [x] In both skills, read `spec-env review waiting --json` before the teardown
      confirmation and filter to the spec being finished. Another spec's pass is
      not this run's business (`.claude/rules/spec-reports.md`: it reports this
      run and nothing else).
- [x] Report spec, code, verdict and age, then the two exits: claim it now with
      `/spec-reviewed <code>` while the worktree still stands, or disown it with
      `spec-env review <spec> --drop <code>`.
- [x] **Report, never block.** No refusal, no extra confirmation of its own, and
      no non-zero exit — the teardown confirmation already asks the operator, and
      a waiting pass is information rather than a gate.
- [x] **It never claims.** Reporting a pass is not taking one; `/spec-diff` §0 is
      untouched.
- [x] Say *why* it matters at this moment: before teardown a `commit` verdict can
      still be claimed and acted on, after it the pass can only be disowned.
- [x] Put it in the report's `Notes` row — what this run hit and handled — not in
      a row of its own invention.
- [x] Tests: a spec with a waiting pass gets the line and the two exits; the line
      names no other spec's pass when one is waiting elsewhere; neither skill
      contains a claim in that block, anchored to the waiting block rather than
      matching `/never claim/` anywhere in the file.
- [x] **Stays-silent test** (rule 3): a spec with no waiting pass produces the
      skill's current output exactly, with no mention of reviews.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Only these two skills. The landed `feat-no-pass-waits-unheard` put the
entry-point report in `/spec-next` and `/spec-start` and left the others out
deliberately — a rule nobody needs teaches people to skim. These two earn it for
a different reason: they are the ones that destroy the worktree.

The anchored claims-nothing test is the shape that spec had to fix once already:
`/never claim/` matched prose elsewhere in the file and stayed green against a
mutation that weakened the rule.

## What this phase found

**A landed test asserted the opposite, and had to be reversed rather than worked
around.** `assets-verdict-wait.test.js` pinned that `/spec-cancel` and
`/spec-complete` were *deliberately left out* of the waiting report — "a line
about waiting reviews on a `/spec-cancel` is noise beside the thing the operator
asked for". That reasoning is right for a skill that merely **passes a pass by**,
and these two do not: they destroy the worktree. The test now carries the
distinction, and `/spec-review` stays excluded on the sharpened ground that it
neither enters the lifecycle nor destroys anything.

**Two other tests were reading `spec-env review` as one verb when it is four.**
`rendersAPage` matched `skitterspec spec-env review <`, so a skill naming
`review <spec> --drop <code>` was classified as rendering a page — and then
accused of not waiting for a verdict on a page it never wrote. The sidecar-only
invocations (`waiting`, `--drop`, `--claim`) are now stripped before the scan
looks, which is a tightening the conflation had been hiding: those touch
`.spec-env/reviews/` and nothing else, so there is nothing for anyone to give a
verdict on.

**Two prose rules fired on the new block**, both mechanical: `Silent when
nothing is waiting` has to sit on one line for the existing assertion to see it,
and a `**bold**` span may not cross a hard line break. Neither changed what the
block says.
