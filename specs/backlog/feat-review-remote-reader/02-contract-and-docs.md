---
github_issue_id: "#224"
---

# Phase 2 — Contract, skills and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the reporting contract, the skills' banners and the review docs page
describe the hidden-local case. The asset tests and the docs-freshness check
pass.

## Tasks

- [ ] Amend the tier rule in `packages/common/assets/rules/spec-reports.md`.
      A tier the engine marks `hidden` is not copied, and the reason is the one
      in Decision 8. Name this as the third amendment and record its argument.
- [ ] Replace the hard-coded "the wait covers local and network" in the banner
      templates (`spec`, `spec-next`, `no-spec`, `spec-review` skills) with
      "copy the engine's `covers` line".
- [ ] Update the tier rule's mention in `packages/common/assets/rules/spec-planning.md`
      if it says "always all three".
- [ ] Document `SKITTERSPEC_READER` and the SSH hint in `docs/review.html`,
      including the `prlctl exec` / SSH examples, and bump its `verified:`.
- [ ] Extend `assets-banner-stack.test.js` (or a sibling test) so the amended
      wording is pinned.
- [ ] Run `pnpm test` and
      `node scripts/docs-freshness.js check`, green.
