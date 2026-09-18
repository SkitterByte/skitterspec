---
linear_issue_id: "SKS-363"
---

# Phase 2 — review.html: mockups + restructured rationale ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the review system has its own page a reader can *see* — inline
HTML mockups carrying the flow, four load-bearing claims as prose, the rest
of the rationale preserved in a disclosure list.

## Tasks

- [x] Create `docs/review.html` in the house style with its own `og:url`.
- [x] Build the review-page mockup: window chrome, file tree with a ✓ accept
      tick, a small diff hunk (add/remove lines), an open note box — pure
      HTML/CSS, theme-aware, no images.
- [x] Build the verdict-bar mockup: ✓ Commit · ✓ Commit & Continue ·
      ↺ Request changes · … Discuss first, with the ▶ Put it live line above
      them, mirroring the real page's shape.
- [x] Build the tier-stack mockup: local / network / remote as three
      labelled doors with one-line descriptions (two doors into one room;
      remote is a separate store needing `/spec-reviewed`), plus a phone-frame
      variant showing the network URL — this is the undervalued half, give it
      the most room.
- [x] Build the pass-back strip: press → engine holds the pass → six-digit
      code → the waiting run claims it; show the code as the address it is.
- [x] Move the `#review` pipeline (BUILD → LOOK → HAND BACK → COMMIT stages)
      from index.html into review.html, keeping the per-stage cost footers.
- [x] Keep four claims as prose beside the mockups: what costs and what
      doesn't; the pass never enters the model; the gate — a phase that ended
      owes an answer; every render lists where the page can be read.
- [x] Convert the remaining ~10 rationale paragraphs into a styled
      `<details>` disclosure list, each summary a question (Why is a tick
      keyed to content? Is the six-digit code a password? Why can't I commit
      with an open note? What stops Claude claiming my pass? …). No content
      deleted — reworded only where a paragraph becomes an answer.
- [x] Point the site nav's Review item at review.html on all pages.
- [x] Update `PAGES` + `og:url` assertions in `scripts/docs-claims.test.js`.
- [x] Run `node --test scripts/docs-claims.test.js` and `pnpm test` — green.

## Notes

Mockups follow the hero's existing pattern (`.win`/`.term`, `.lcard`) — new
classes in the same idiom, never a raster. Check both themes and mobile
widths by hand; the tests cannot see layout.
