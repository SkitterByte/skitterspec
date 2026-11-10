---
github_issue_id: "#159"
---

# Phase 6 — Linear, Jira, Azure Boards ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the same push links members under the epic in the other three
trackers, each in its native way.

## Tasks

- [ ] Linear: member issue's parent = epic issue
- [ ] Jira: epic pushed as issue type Epic; member's parent (or Epic Link on
      older projects) = the epic
- [ ] Azure Boards: epic pushed as work item type Epic (via
      `workItemTypeByKind`); member linked as its child in the hierarchy
- [ ] Each: idempotent re-push, re-parenting, verify read-back
- [ ] Each provider's `/spec-list` groups members under their epic
- [ ] Tests per provider against its fake
