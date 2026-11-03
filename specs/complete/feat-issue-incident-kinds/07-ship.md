---
github_issue_id: "#92"
---

# Phase 7 — Migration notes, docs sweep, shipping checks ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a consumer on the previous version can adopt everything from the
MIGRATION notes alone, and the supersets ship it.

## Tasks

- [x] MIGRATION notes: one new section synced into all five packages'
      `MIGRATION.md`, with the consumer config per provider and the ereqs
      example (`Issue.complete = Closed`, `Incident.backlog = null`,
      `Incident.complete = Closed`) spelled out; the new `states --json`
      keyed shape and its flat-array compatibility are named
- [x] Provider `*.config.md` field references updated:
      `statesByType` (azure, jira), `statesByKind` (github, linear),
      `github.severityLabels`, `linear.severityLabels`, `jira.severityField`,
      and the kind lists widened to `issue`/`incident` (env.config.md has no
      new keys — nothing in it changed)
- [x] `skitterspec update` delivers `/spec-incident` — skills are discovered
      from the assets tree; the install, claude-links and skill-budget tests
      all pass with it, and `pnpm relink` linked it into this repo's `.claude`
- [x] Supersets rebuild clean (`npm run build`; no new vendored edit sites)
- [x] `node scripts/docs-freshness.js impact` — nothing to flag; every named
      page was edited in the phase that changed its code with `verified:`
      bumped
- [x] Full suite: `pnpm -r test` green (all 7 packages), root 4,235 pass; no
      typecheck script in this repo
