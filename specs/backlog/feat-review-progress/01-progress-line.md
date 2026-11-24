---
github_issue_id: "#294"
---

# Phase 1 — Progress line and bar on the review page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the review page shows phase and task progress under its title, and
nothing at all where there are no phases. This is proven by page tests over the
rendered data.

## Tasks

- [ ] In `page.html`'s header script, render a `.progress` block from
      `data.phases`: the text for each of the three states in the overview, and
      a bar filled to `done / total`.
- [ ] Draw nothing when `data.phases` is null or `total` is 0.
- [ ] Style it from the existing theme tokens, so it works in light and dark
      themes and at phone width.
- [ ] Mention the progress line in `docs/review.html`, then stamp it with
      `node scripts/docs-freshness.js verify review`.
- [ ] Tests: each of the three states renders its text and bar width; null
      phases and an epic's `total: 0` render nothing. Use the page test harness
      the review page's other header tests use. `pnpm build && pnpm test`
      green.
