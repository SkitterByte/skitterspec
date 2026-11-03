---
github_issue_id: "#92"
---

# Phase 7 — Migration notes, docs sweep, shipping checks ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a consumer on the previous version can adopt everything from the
MIGRATION notes alone, and the supersets ship it.

## Tasks

- [ ] MIGRATION notes (per affected package, matching the chore-kind
      precedent): the consumer config to add —
      `workItemTypeByKind.issue/.incident`, `statesByType` / `statesByKind`,
      `severityLabels` / `jira.severityField` — with the ereqs example
      (`Issue.complete = Closed`, `Incident.backlog = null`,
      `Incident.complete = Closed`) spelled out
- [ ] `env.config.md` / provider `*.config.md` field references updated for
      every new key
- [ ] Verify `skitterspec update` delivers `/spec-incident` and the edited
      skills/rules on a consumer checkout (manifest test)
- [ ] Supersets rebuild clean (`scripts/build-dist.js` — no new vendored
      edit sites)
- [ ] `node scripts/docs-freshness.js impact` clean: every page named in the
      `Docs:` header was edited in the phase that changed its code, with
      `verified:` bumped
- [ ] Full suite: `pnpm -r test` + typecheck — green
