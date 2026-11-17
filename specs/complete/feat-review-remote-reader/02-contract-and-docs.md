---
github_issue_id: "#224"
---

# Phase 2 — Contract, skills and docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the reporting contract, the skills' banners and the review docs page
describe the hidden-local case. The asset tests and the docs-freshness check
pass.

## Tasks

- [x] Amend the tier rule in `packages/common/assets/rules/spec-reports.md`.
      A tier the engine marks `hidden` is not copied, and the reason is the one
      in Decision 8. Name this as the third amendment and record its argument.
- [x] Replace the hard-coded "the wait covers local and network" in the banner
      templates (`spec`, `spec-next`, `no-spec`, `spec-review` skills) with
      "copy the engine's `covers` line".
- [x] Update the tier rule's mention in `packages/common/assets/rules/spec-planning.md`
      if it says "always all three".
- [x] Document `SKITTERSPEC_READER` and the SSH hint in `docs/review.html`,
      including the `prlctl exec` / SSH examples, and bump its `verified:`.
- [x] Extend `assets-banner-stack.test.js` (or a sibling test) so the amended
      wording is pinned.
- [x] Run `pnpm test` and
      `node scripts/docs-freshness.js check`, green.

## Notes

The skill banner templates still read "the wait covers local and network",
because that is the common case. The contract now says the holding line follows
the engine's `covers`, and every skill copies the stack from the engine, so a
hidden `local` never reaches a banner. `spec-planning.md` has no "always all
three" wording, so it needed no change. The `review.reader` comment in
`env.config.md` documents the variable as well.
