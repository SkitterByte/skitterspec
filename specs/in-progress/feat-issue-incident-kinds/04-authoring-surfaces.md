---
github_issue_id: "#89"
---

# Phase 4 — Authoring surfaces: issue proposal + /spec-incident ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec` can propose an issue spec, `/spec-incident` exists and
writes an in-progress incident spec, and the rules tables know all six kinds.

## Tasks

- [x] `/spec` (`packages/common/assets/skills/spec/SKILL.md`): the kind
      proposal is three-way — feature / chore / issue ("no code change,
      manual steps → issue"); issue defaults `Gating: none: no code`, commits
      `docs` with no `Release-Note:`; an outage uncovered in the grill hands
      off to `/spec-incident`; template gains the optional `Incident:` header
- [x] New skill `packages/common/assets/skills/spec-incident/SKILL.md`:
      short grill (what is down, since when, who affected, severity, what was
      tried), writes straight into `specs/in-progress/` in its own `--docs`
      worktree with `> **Type:** Incident`, `> **Severity:**`, a `## Timeline`
      and a `## Fixes` section; fixes are separate linked specs, never
      phases; default gating `none: incident record, no code`; provider seam
      links on write; no review page mid-outage — the record is reviewed at
      completion (deliberate: nothing waits on a verdict while a service is
      down)
- [x] Fix-spec linking grammar: `> **Incident:** incident-<name>` header
      documented in `/spec`, `/spec-bug`, `/spec-hotfix` templates (with the
      optional `Severity:` header on bug/hotfix)
- [x] `.claude/rules/spec-planning.md`: skill table row, six-kind type
      section, folder prefixes, `Severity:`/`Incident:` header fields
- [x] `/spec-start`, `/spec-cancel`, `/spec-review` sanity pass — no
      hardcoded kind lists found (they read the folder prefix generically)
- [x] `skitterspec init` / `update` deliver the new skill — skills are
      discovered from the assets tree, so no manifest edit; the
      report-contract list, spec-init's own skill count, README/docs command
      listings and docs/linear.html's installed count all updated to include
      it
- [x] Docs: `docs/reference.html` skill table + kind wording; `verified:`
      bumped on reference, index and linear pages
- [x] Tests: skill-budget / docs-claims / report-contract / workflows suites
      green with the new skill; `pnpm -r test` green, root 4,215 pass; no
      typecheck script in this repo
