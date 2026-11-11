---
github_issue_id: "#176"
---

# Phase 2 — Served index + epic page, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the served index and epic page name their project the same way, and
the docs describe the new key — proven by render tests.

## Tasks

- [ ] Pass the resolved name into the served index in
      `packages/common/src/env/serve.js`: `<title>` and h1
      `<project> · spec diffs`
- [ ] Pass it into `packages/common/src/env/epicpage.js`: `<title>`
      `<project> · <epic>` and an eyebrow line above the h1
- [ ] Document `review.projectName` in
      `packages/common/assets/core/env.config.md` and the
      `env.config.json.example`
- [ ] Update `docs/review.html` and `docs/reference.html`; bump their
      `verified:` to this commit
- [ ] Tests: both pages escape the name, and render unchanged with no name
- [ ] Run `pnpm typecheck` and `pnpm test` — green before the phase is done
