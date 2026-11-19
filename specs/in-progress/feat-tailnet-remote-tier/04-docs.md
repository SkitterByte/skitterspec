---
github_issue_id: "#254"
---

# Phase 4 — Docs and migration ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the docs pages describe three same-room doors and no published tier,
MIGRATION.md tells an upgrader what went away, and the docs-freshness checks
are quiet.

## Tasks

- [ ] `docs/review.html`, `docs/index.html`, `docs/reference.html`: rewrite
      the tier and publish passages. Remove `/spec-remote-review` and
      `review.allowRemote`.
- [ ] `docs/linear.html`, `docs/jira.html`, `docs/azure-boards.html`: fix the
      one publish/remote mention on each.
- [ ] `packages/common/README.md` and `packages/skitterspec/README.md` (the
      prose about publishing a page and the command table row): remove the
      remote-review lines.
- [ ] `MIGRATION.md`: add an entry. Publishing is gone, `allowRemote` is
      ignored, `/spec-remote-review` is retired by `update`, and the tailnet
      URL is now `remote`.
- [ ] Run `node scripts/docs-freshness.js verify` on each edited page.
- [ ] Run `pnpm test`, including `docs-claims`, `docs-freshness` and
      `claude-md-section`, and get it green.
