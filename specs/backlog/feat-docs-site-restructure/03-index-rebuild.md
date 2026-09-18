---
linear_issue_id: "SKS-364"
---

# Phase 3 — Rebuild index.html: hero, review teaser, trim ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** index.html reads as marketing + process: a hero selling the loop
and the review, a review teaser that sends readers to review.html, and no
engine detail anywhere on the page.

## Tasks

- [ ] Rewrite the hero: headline sells spec-driven dev + the review loop
      (direction: "The spec is the plan. The page is the review. Git is the
      board."); sub-copy keeps the grilled-spec → landed-code arc.
- [ ] Replace the hero's Linear card with a compact review-page mockup
      (reuse phase 2's classes): terminal mockup → review page with verdict
      buttons.
- [ ] Demote Linear in the hero to one line + link ("tracker-optional — add
      Linear →"), keep the #linear section below as the superset's on-page
      summary.
- [ ] Drop `+ linear` from the brand lockup.
- [ ] Build the review teaser section replacing the old #review wall: one
      mockup, three claims (the diff costs zero context tokens · the button
      carries the work on · local/network/remote), "How review works →" to
      review.html.
- [ ] Re-order the page: hero → loop → walkthrough → report → review teaser
      → Linear summary → quickstart; update the nav anchors to match.
- [ ] Sweep the walkthrough and remaining copy for `spec-env` mentions —
      each either goes, or becomes a link to reference.html.
- [ ] Run `node --test scripts/docs-claims.test.js` and `pnpm test` — green.

## Notes

The report section (#report) stays — it is process, not engine detail, and
its block mockup is exactly the show-don't-tell shape this spec wants more of.
