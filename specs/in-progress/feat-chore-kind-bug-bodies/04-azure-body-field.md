---
github_issue_id: "#79"
---

# Phase 4 — Azure: body field by type ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a pushed Bug carries its body in `Microsoft.VSTS.TCM.ReproSteps`
when mapped, and an immediate `/spec-status` reports **no** edited
description — the mapping is symmetric across write, read and hash.

## Tasks

- [x] `packages/azure-boards/src/config.js`: add `azure.bodyFieldByType`
      (work-item-type → field name), default empty; resolution falls back to
      `System.Description`. Validate values are non-empty strings.
- [x] `packages/azure-boards/src/api.js` `itemPatch`: write the resolved body
      field (and its `/multilineFieldsFormat/<field>` Markdown declaration)
      for the item's type instead of hard-coded `System.Description`.
      (`updateIssue` resolves the type with one field read, only when a
      mapping exists and a description is being written.)
- [x] Read-back: `descriptionText` (~161) and the dialect `description()`
      (`config.js` ~302) read the same resolved field, including the
      Markdown-format check and HTML fallback. (Plus a legacy fallback: an
      empty mapped field reads `System.Description`, so pre-mapping items are
      not accused of an edit.)
- [x] Edited-in-Boards hash compare uses the same field — pushing then
      checking must round-trip clean. (Via the dialect `description()` that
      `remoteDescriptionEdited` reads.)
- [x] Ensure batch/read paths request the mapped fields where field lists are
      explicit (e.g. `workitemsbatch` field sets). (Audited: the explicit
      field lists are Title/State/Tags only — no description read goes
      through them; `readIssue` fetches full fields.)
- [x] `spec-sync doctor --check-remote`: verify every `workItemTypeByKind`
      type exists in the project and carries its configured body field;
      report, don't guess, when the API cannot answer
      (`negative-checks.md` rule 4). (New `listTypeFields` op; no row at all
      when nothing is mapped.)
- [x] Update `docs/azure-boards.html` (new config key, doctor check) and bump
      `verified:`, same commit. (Key reference lives in
      `azure-boards.config.md` + json example; page `verified:` bumped.)
- [x] Tests: push a bug spec with `bug → Bug` + the field mapping fills Repro
      Steps; immediate status reports no edit; unmapped type keeps
      `System.Description` byte-identical (stays-silent); doctor flags a
      missing type/field and stays silent on a healthy one. Typecheck + tests
      green. (141 pass; also the MCP creates map the field, with its update
      limitation noted in the code.)
