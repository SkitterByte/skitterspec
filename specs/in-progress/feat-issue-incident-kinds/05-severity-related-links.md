---
github_issue_id: "#90"
---

# Phase 5 — Severity + related links on push ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the push writes the `Severity:` header and the `Incident:` link,
one-way, on every provider that has a home for them.

## Tasks

- [x] Header parsing (sync-core): `specHeaders` reads `> **Severity:**` /
      `> **Incident:**` off the overview, `linkedIncident` resolves the
      incident's stamped identifier across buckets — push-time extras,
      deliberately not keys on the synced field set
- [x] Azure: `Microsoft.VSTS.Common.Severity` written on create and update; a
      type without the field is retried once without it with a note (the
      assignee-refusal pattern), never a field-presence pre-read
- [x] Azure: `addRelatedLink` adds `System.LinkTypes.Related` after
      mint/update; an already-present relation answers `already` instead of
      erroring
- [x] Jira: opt-in `jira.severityField` written via adapter `extraFields`; a
      "Relates" issue link added once — `listRelatedLinks` makes the existing
      link the skip condition, since Jira stacks duplicates and a push runs
      per phase
- [x] Linear: opt-in `linear.severityLabels` (digit → label name) resolved
      beside the kind label; a "related" issue relation via
      `issueRelationCreate`, duplicate answered as `already`
- [x] GitHub: opt-in `github.severityLabels` (digit → label name); the
      `Related incident: <identifier|name>` line is part of the **projection**
      (all providers), so the stored base, the plan and the tracker hash the
      same bytes — on GitHub the `#N` backlinks on the incident's timeline
- [x] Unlinked incident: reported in the push output
      (`not linked yet — link skipped`), push completes
- [x] One-way rule holds: nothing is read back into the repo; the hash
      compare is unaffected because the body line is projected, not appended
      at send time
- [x] Tests: sync-core header/resolution/projection suite
      (`sync-incident-headers.test.js`, stays-silent included); azure severity
      + Related link + unlinked-incident line; jira severityField + Relates
      dedupe; github severity label + body cross-reference; linear severity
      label + relation
- [x] Docs: azure-boards (statesByType + per-type check + headers), jira,
      github, linear pages updated, `verified:` bumped
- [x] Run `pnpm -r test` + typecheck — green (packages 0 failures, root 4,225
      pass; no typecheck script in this repo)
