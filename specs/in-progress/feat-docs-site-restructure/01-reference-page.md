---
linear_issue_id: "SKS-362"
---

# Phase 1 — Scaffold the split: reference.html + shared nav ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `reference.html` exists carrying both reference tables, every page
shares the four-item nav, and the docs-claims suite passes against the new
page set — proving the split without yet touching index's marketing.

## Tasks

- [x] Create `docs/reference.html`, self-contained in the house style (copy
      the shared CSS baseline from index.html): head, theme toggle, nav,
      footer, its own canonical `og:url` + `og.png` reference.
- [x] Move the `#reference` skills table (all groups, including the Linear
      group with its superset note) from index.html to reference.html.
- [x] Move the `#engine` section (the spec-env verbs table and its
      surrounding prose) from index.html to reference.html.
- [x] Leave a short pointer section on index.html in their place (one line +
      link), so no in-page anchor from the old nav dangles.
- [x] Update the nav on all four pages to: Home · Review · Reference ·
      Linear · Get started (Review links may 404 locally until phase 2 —
      point it at index's teaser anchor until review.html exists, then fix in
      phase 2; the cross-page link test must pass at every phase end).
- [x] Update `docs/README.md`: the two-page table becomes four, and the note
      "the command reference stays whole on index.html" moves to
      reference.html.
- [x] Extend `scripts/docs-claims.test.js`: add `docs/reference.html` to
      `PAGES`; assert its `og:url`; confirm the engine-verb and skill-claim
      checks now find their tables there.
- [x] Run `node --test scripts/docs-claims.test.js` then the full
      `pnpm test` — green before the phase is done.

## Notes

The docs-claims tests are the guard rail for this whole spec: every verb the
engine dispatches must stay documented on a page in `PAGES`, and no in-page
or cross-page link may dangle. Run them after every move, not just at the end.
