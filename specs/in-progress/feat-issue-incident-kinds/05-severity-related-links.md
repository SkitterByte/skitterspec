---
github_issue_id: "#90"
---

# Phase 5 — Severity + related links on push ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the push writes the `Severity:` header and the `Incident:` link,
one-way, on every provider that has a home for them.

## Tasks

- [ ] Header parsing (sync-core): read `> **Severity:**` and
      `> **Incident:**` off the spec overview into the normalized projection
- [ ] Azure: write `Microsoft.VSTS.Common.Severity` on create and update
      **where the mint type has the field** (reuse the existing field-presence
      check, cli-sync.js:1330 area); a type without it skips silently
- [ ] Azure: resolve the `Incident:` spec name to its work item id (via the
      target spec's stamped identifier) and add a `System.LinkTypes.Related`
      relation (extend the existing relations machinery,
      `packages/azure-boards/src/api.js:146-312`); already-present link is a
      no-op
- [ ] Jira: opt-in `jira.severityField` (field id; header value written
      verbatim); add a "Relates" issue link to the incident's issue
- [ ] Linear: opt-in `linear.severityLabels` (digit "1"–"4" → label name);
      create a related-issue relation to the incident's issue
- [ ] GitHub: opt-in `github.severityLabels` (digit → label name); the
      generated fix-issue body gains a "Related incident: #N" line (backlinks
      on the incident's timeline; regenerated every push)
- [ ] Unlinked incident (no stamped identifier on the target spec): report in
      the push output and carry on — never fail the push over the link
- [ ] One-way rule holds: the link and severity are never read back; the
      edited-in-tracker hash compare is unaffected (GitHub body line is part
      of the generated body, so it participates in the hash like any other
      projected line)
- [ ] Tests: severity written where configured/field present, skipped
      silently where not; related link added per provider; unlinked incident
      reports and completes; spec with neither header pushes byte-for-byte as
      today (stays-silent)
- [ ] Docs: provider pages (azure-boards, github, jira, linear) — new config
      keys and the two headers
- [ ] Run `pnpm -r test` + typecheck — green
