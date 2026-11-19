---
github_issue_id: "#264"
---

# Phase 2 — Docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the `--local` docs say the conversion is per branch and what the
report means.

## Tasks

- [x] `docs/reference.html`: under `init --local`, say the conversion
      covers the current branch only, and describe the branch report and its
      cannot-tell line
- [x] `docs/index.html`: one line beside the `--local` install step
- [x] Run `node scripts/docs-freshness.js verify index reference`
- [x] Run `node scripts/docs-freshness.js impact` and `pnpm test` — green
