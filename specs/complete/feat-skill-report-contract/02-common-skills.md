---
linear_issue_id: "SKS-193"
---

# Phase 2 — Retrofit the 11 lifecycle skills, enforced by test ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every skill in `packages/common/assets/skills` ends with the contract
block, and a test proves it rather than a reviewer remembering to look.

## Tasks

- [x] Rewrite `## Report` in each of the 11: `spec`, `spec-bug`, `spec-hotfix`,
      `spec-start`, `spec-next`, `spec-to-main`, `spec-complete`, `spec-cancel`,
      `spec-review`, `spec-diff`, `spec-init`. Each becomes: a pointer to
      `.claude/rules/spec-reports.md`, the verdict states that can occur, and the
      skill's declared field list.
- [x] Keep the behaviour that currently sits inside those sections — *"Do not
      `git commit` unless the user asks"*, the hotfix's push warning, the
      teardown report's *"say what you reclaimed"* — moving it above the block
      rather than deleting it with the prose it was embedded in.
- [x] Give each skill its field list deliberately, not uniformly: `/spec-diff`
      reports the page and the review totals, `/spec-complete` reports the
      landing and what was reclaimed, `/spec-init` reports per-area
      created/updated/already-present.
- [x] Write `packages/common/test/assets-report-contract.test.js`: every skill
      names the contract rule, declares at least one field, and declares
      `Follow-ups`. Drive it from a list of skills so phase 3 can extend it.
- [x] Pair it with a stays-silent case (`.claude/rules/negative-checks.md`
      rule 3): a skill whose `## Report` is correctly minimal must not be
      flagged, and neither must a legitimately field-less report if one exists.
- [x] Re-check the skills that assert ordering — `assets-offer-last.test.js` and
      `spec-next`'s *"then step 5's offer, and nothing after it"*. The block and
      the diff offer must not now contradict each other about which is last.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

`spec-complete` and `spec-cancel` carry long teardown sections **after**
`## Report`, so "the block is the last thing on screen" is a claim about the
run's output, not about the file's layout. Check each skill's flow rather than
assuming the heading order matches the execution order.

`spec-next` already fixes an order — built, tests, next phase, then the diff page
and its offer. Fold the offer into the block's `Diff`/`Next` fields or state
explicitly that it follows the block; do not leave two rules about what comes
last.
