---
github_issue_id: "#268"
---

# Phase 2 — Docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every page that offers `init --local` also names the way back.

## Tasks

- [ ] Add a `skitterspec uninstall` row to `docs/reference.html`
- [ ] Add one line on the way back to the `init --local` paragraph in `docs/index.html` and the four provider pages
- [ ] Stamp each page: `node scripts/docs-freshness.js verify <page...>`
- [ ] Run `pnpm test` (the docs-freshness check included) — green
