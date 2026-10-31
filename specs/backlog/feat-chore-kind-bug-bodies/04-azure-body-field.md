---
github_issue_id: "#79"
---

# Phase 4 — Azure: body field by type ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a pushed Bug carries its body in `Microsoft.VSTS.TCM.ReproSteps`
when mapped, and an immediate `/spec-status` reports **no** edited
description — the mapping is symmetric across write, read and hash.

## Tasks

- [ ] `packages/azure-boards/src/config.js`: add `azure.bodyFieldByType`
      (work-item-type → field name), default empty; resolution falls back to
      `System.Description`. Validate values are non-empty strings.
- [ ] `packages/azure-boards/src/api.js` `itemPatch`: write the resolved body
      field (and its `/multilineFieldsFormat/<field>` Markdown declaration)
      for the item's type instead of hard-coded `System.Description`.
- [ ] Read-back: `descriptionText` (~161) and the dialect `description()`
      (`config.js` ~302) read the same resolved field, including the
      Markdown-format check and HTML fallback.
- [ ] Edited-in-Boards hash compare uses the same field — pushing then
      checking must round-trip clean.
- [ ] Ensure batch/read paths request the mapped fields where field lists are
      explicit (e.g. `workitemsbatch` field sets).
- [ ] `spec-sync doctor --check-remote`: verify every `workItemTypeByKind`
      type exists in the project and carries its configured body field;
      report, don't guess, when the API cannot answer
      (`negative-checks.md` rule 4).
- [ ] Update `docs/azure-boards.html` (new config key, doctor check) and bump
      `verified:`, same commit.
- [ ] Tests: push a bug spec with `bug → Bug` + the field mapping fills Repro
      Steps; immediate status reports no edit; unmapped type keeps
      `System.Description` byte-identical (stays-silent); doctor flags a
      missing type/field and stays silent on a healthy one. Typecheck + tests
      green.
