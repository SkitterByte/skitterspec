---
github_issue_id: "#43"
---

# Phase 4 — work item types in intake and minting ✅

> **Status:** Done

**Goal:** in a process where a bug is a type, an untagged `Bug` work item
routes to `/spec-bug`, and `/spec-bug`/`/spec-hotfix` mint the right type.

- [x] `intake.bugTypes` (default `["Bug"]`) and `intake.hotfixTypes`
      (default `[]`) in config: merge, validation, explicit `[]` opts out.
- [x] `azure.workItemTypeByKind` (e.g. `{ "bug": "Bug", "hotfix": "Bug" }`),
      falling back to `azure.workItemType`; `apply` mints a `bug-`/`hotfix-`
      spec with it, and the twin search uses the same type.
- [x] `states` asks every configured type (deduped), so a per-kind type's
      states are validated before the first write, like the existing check.
- [x] Intake seam routes by type **or** tag, hotfix still first;
      `/spec-azure-setup` asks about the types; `azure-boards.config.md`
      documents them.
- [x] Tests green: the two intake config tests, `azure.workItemTypeByKind
      merges and defaults empty`, `a bug spec mints with
      azure.workItemTypeByKind…`, `states asks every configured type once…`.
