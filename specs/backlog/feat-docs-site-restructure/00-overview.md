---
linear_identifier: "SKS-361"
linear_url: "https://linear.app/skitterbyte/issue/SKS-361/restructure-the-docs-site-four-pages-review-made-visible"
---

# Restructure the docs site — four pages, review made visible

> **Type:** Feature
> **Name:** feat-docs-site-restructure (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-18
> **Area:** docs/index.html, docs/review.html (new), docs/reference.html (new), docs/linear.html, docs/README.md, scripts/docs-claims.test.js
> **Stack:** worktree

## Problem

`docs/index.html` is 1100 lines doing four jobs at once: marketing, process,
the full skill reference and the `spec-env` engine reference. Visitors drive
the product from Claude, so the engine detail dominates a page that should
sell the workflow. The review system — the strongest differentiator, with its
local/network/remote tiers and the pass-back loop — has **no visuals at all**:
it is fourteen consecutive `<p class="lede">` paragraphs, a wall nobody reads.
And `linear.html` shares the same accent (`#0f6fb8`) and the same
`skitterspec + linear` lockup as the base page, so nothing signals you are in
a different package.

## Decisions

1. **Four pages: `index.html` · `review.html` (new) · `reference.html` (new) ·
   `linear.html`.** Supersedes feat-docs-site-split's two-page decision
   (2026-09-02) — the product has outgrown it. Rejected staying one page
   (stays long) and a five-page split with a separate getting-started page
   (quickstart is short enough to keep on the landing page).
2. **`index.html` is marketing + process only**: hero, the report block, the
   loop, the walkthrough, a review teaser, quickstart. The two reference
   tables (18 skills, 13 `spec-env` verbs) move to `reference.html`.
3. **The hero leads with the loop + review; Linear demoted to one line.**
   Current headline ("Your specs live in git. Linear just watches.") sells a
   tracker on the tracker-free page. New hero visual: terminal mockup → review
   page mockup with verdict buttons. Linear gets a one-liner + link near the
   CTA. Rejected keeping the two-surface story as the headline.
4. **`review.html` carries the review system in full, shown not told.**
   Inline theme-aware HTML mockups (like the hero's terminal/Linear cards):
   the review page itself (file tree, diff hunk, ✓ accept, note box), the
   verdict buttons, the tier stack (local/network/remote), the six-digit
   pass-back. Rejected screenshots: binary assets, single-theme, rot when the
   real page's CSS changes.
5. **The rationale wall: ~4 load-bearing claims stay prose, the rest become a
   disclosure list** (`<details>`-style FAQ). Nothing is deleted. The four
   that stay: what costs and what doesn't; the pass never enters the model;
   the gate (a phase that ended owes an answer); the tier stack. Rejected
   cutting to links into the repo (arguments stop being discoverable) and a
   separate design-notes page (a fifth page for prose nobody navigates to).
6. **Index review teaser is a full section**: one mockup + three claims (the
   diff costs zero context · the button carries the work on · read it
   anywhere) + "How review works →". Rejected a one-line strip — the
   undervalued feature stays undervalued if the landing page doesn't sell it.
7. **`linear.html` gets its own identity**: Linear-indigo accent (`#5E6AD2`),
   a `skitterspec-linear` lockup, and a package banner naming
   `@skitterbyte/skitterspec-linear`. `index.html` drops `+ linear` from its
   brand lockup — the base page shouldn't advertise a tracker in its header.
8. **`scripts/docs-claims.test.js` extends to the new pages**: `PAGES` gains
   `review.html` and `reference.html`; each new page carries its own canonical
   `og:url`; the verb/skill-claims checks keep holding wherever the tables
   land. The shared `og.png` stays one card for the project.
9. **All pages stay self-contained** — no build step, CSS/JS inlined,
   theme-aware with the manual toggle, `prefers-reduced-motion` respected.
   Same constraints as today, now across four files.

## Solution overview

Split by audience. A visitor deciding whether to adopt reads `index.html`
top to bottom and never meets a CLI verb. A reader sold on the workflow opens
`review.html` and *sees* the review page before reading why it is shaped that
way. Someone looking a command up lands on `reference.html`, where every
skill and every engine verb lives in one place (keeping the docs-claims tests
satisfied). The superset reader gets a `linear.html` that is visibly a
different package. All four share one nav: Home · Review · Reference · Linear.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Page | update | docs/index.html — new hero, review teaser, tables out |
| Page | add | docs/review.html — review system, mockups, rationale |
| Page | add | docs/reference.html — 18 skills + 13 spec-env verbs |
| Page | update | docs/linear.html — indigo accent, lockup, package banner |
| Docs | update | docs/README.md — four-page table, deploy notes |
| Test | update | scripts/docs-claims.test.js — PAGES, og:url, link checks |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Scaffold the split — reference.html + shared nav | ⬜ | [01-reference-page.md](01-reference-page.md) |
| 2 | review.html — mockups + restructured rationale | ⬜ | [02-review-page.md](02-review-page.md) |
| 3 | Rebuild index.html — hero, teaser, trim | ⬜ | [03-index-rebuild.md](03-index-rebuild.md) |
| 4 | Re-skin linear.html — package identity | ⬜ | [04-linear-identity.md](04-linear-identity.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-18 — Spec created. Supersedes feat-docs-site-split's two-page
  decision; the site grows to four pages and the review system becomes the
  visual centrepiece.
