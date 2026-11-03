---
github_issue_id: "#89"
---

# Phase 4 — Authoring surfaces: issue proposal + /spec-incident ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec` can propose an issue spec, `/spec-incident` exists and
writes an in-progress incident spec, and the rules tables know all six kinds.

## Tasks

- [ ] `/spec` (`packages/common/assets/skills/spec/SKILL.md`): the kind
      proposal becomes three-way — feature / chore / issue ("no code change,
      manual steps → issue"); issue defaults `Gating: none: no code`, commits
      `docs` with no `Release-Note:`; note that an outage in the grill routes
      to `/spec-incident`
- [ ] New skill `packages/common/assets/skills/spec-incident/SKILL.md`,
      modelled on `/spec-bug`'s shape: grill (what is down, since when, who is
      affected, severity, what has been tried), then write the spec straight
      into `specs/in-progress/` with `> **Type:** Incident`,
      `> **Severity:**` (Azure's literal values, `1 - Critical` … `4 - Low`),
      a `## Timeline` section (dated entries, appended as the incident
      unfolds), and fixes recorded as separate specs — never child phases.
      Default gating `none: incident record, no code`. Provider seam: link on
      write like `/spec-bug`
- [ ] Fix-spec linking grammar: `> **Incident:** incident-<name>` header,
      documented in `/spec`, `/spec-bug`, `/spec-hotfix` (one line each: offer
      it when the work fixes an open incident)
- [ ] `.claude/rules/spec-planning.md` (packages/common/assets/rules): kind
      tables, folder-prefix list, header-field list gain the two kinds plus
      the `Severity:` and `Incident:` headers
- [ ] `/spec-start`, `/spec-cancel`, `/spec-review` sanity pass: nothing
      kind-specific expected (they read the folder prefix generically) —
      verify, fix any hardcoded kind list
- [ ] `skitterspec init` / `update` deliver the new skill (skill manifest /
      budget tests updated)
- [ ] Docs: `docs/reference.html` kind table and headers section
- [ ] Tests: skill-budget / docs-claims / workflows test suites pass with the
      new skill; `pnpm -r test` + typecheck — green
