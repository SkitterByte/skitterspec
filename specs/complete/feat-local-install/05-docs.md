---
github_issue_id: "#239"
---

# Phase 5 — Docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the local install is documented where install is documented.

## Tasks

- [x] README and `docs/reference.html`: `init --local`, when to use it (one
      developer on a shared repo), when NOT to (a team that shares the
      hooks/rules as policy), what stays committed, global CLI install.
- [x] Provider pages (`azure-boards`, `github`, `jira`, `linear`): global
      install as an option; runner no longer assumed to be pnpm.
- [x] Bump each edited page's `verified:`.
- [x] Run `node scripts/docs-freshness.js check` and `pnpm test`.
