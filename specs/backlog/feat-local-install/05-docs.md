---
github_issue_id: "#239"
---

# Phase 5 — Docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the local install is documented where install is documented.

## Tasks

- [ ] README and `docs/reference.html`: `init --local`, when to use it (one
      developer on a shared repo), when NOT to (a team that shares the
      hooks/rules as policy), what stays committed, global CLI install.
- [ ] Provider pages (`azure-boards`, `github`, `jira`, `linear`): global
      install as an option; runner no longer assumed to be pnpm.
- [ ] Bump each edited page's `verified:`.
- [ ] Run `node scripts/docs-freshness.js check` and `pnpm test`.
