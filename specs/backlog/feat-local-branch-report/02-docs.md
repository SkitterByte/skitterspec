---
github_issue_id: "#264"
---

# Phase 2 — Docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the `--local` docs say the conversion is per branch and what the
report means.

## Tasks

- [ ] `docs/reference.html`: under `init --local`, say the conversion
      covers the current branch only, and describe the branch report and its
      cannot-tell line
- [ ] `docs/index.html`: one line beside the `--local` install step
- [ ] Run `node scripts/docs-freshness.js verify index reference`
- [ ] Run `node scripts/docs-freshness.js impact` and `pnpm test` — green
