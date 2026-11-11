---
github_issue_id: "#176"
---

# Phase 2 — Served index + epic page, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the served index and epic page name their project the same way, and
the docs describe the new key — proven by render tests.

## Tasks

- [x] Pass the resolved name into the served index in
      `packages/common/src/env/serve.js`: `<title>` and h1
      `<project> · spec diffs`
- [x] Pass it into the server's own spec-page renders (`renderSpecPage`,
      worktree and `--docs` views) — the served page re-renders per request
- [x] Pass it into `packages/common/src/env/epicpage.js`: `<title>`
      `<project> · <epic>` and an eyebrow line above the h1
- [x] Update `docs/review.html` and `docs/reference.html`; bump their
      `verified:` to this commit
- [x] Tests: both pages escape the name, and render unchanged with no name
- [x] Run `pnpm typecheck` and `pnpm test` — green before the phase is done
