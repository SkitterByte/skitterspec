---
github_issue_id: "#159"
---

# Phase 6 — Linear, Jira, Azure Boards ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the same push links members under the epic in the other three
trackers, each in its native way.

## Tasks

- [x] Linear: member issue's parent = epic issue
- [x] Jira: epic pushed as issue type Epic; member's parent (or Epic Link on
      older projects) = the epic
- [x] Azure Boards: epic pushed as work item type Epic (via
      `workItemTypeByKind`); member linked as its child in the hierarchy
- [x] Each: idempotent re-push, re-parenting, verify read-back
- [x] Each provider's `/spec-list` groups members under their epic
- [x] Tests per provider against its fake

## Notes

- Jira and Azure mint an epic as `Epic` by default (the type that makes it a
  native parent), overridable by `issueTypeByKind.epic` /
  `workItemTypeByKind.epic`. Only a MAPPED type is in the `states` check, so an
  unmapped default's states are not validated before a push.
- Jira writes the `parent` field; a site still on the legacy Epic Link field
  refuses, and the push reports it rather than reaching for a custom field.
- Linear's listing queries parentless issues, so members are fetched as the
  children of each linked epic row — one call per epic row, none otherwise.
- The keep-and-group rule shared by GitHub, Jira and Azure lives in
  provider-kit `epic-rows.js`.
