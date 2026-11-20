---
github_issue_id: "#268"
---

# Phase 3 — Docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every page that offers `init --local` also names disable, enable and the way back.

## Tasks

- [x] Add `skitterspec uninstall`, `disable` and `enable` rows to `docs/reference.html`
- [x] Add one line on the way back to the `init --local` paragraph in `docs/index.html` and the four provider pages
- [x] Stamp each page: `node scripts/docs-freshness.js verify <page...>`
- [x] Run `pnpm test` (the docs-freshness check included) — green
