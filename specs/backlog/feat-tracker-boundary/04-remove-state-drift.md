---
github_issue_id: "#67"
---

# Phase 4 — Remove state drift ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `status` and `/spec-status` report what would push and whether the
description was edited, and no longer report a tracker state that differs
from the spec's.

## Tasks

- [ ] Remove the state-drift comparison from `status` in GitHub, Linear and
      Azure `cli-sync.js` (and Jira's equivalent)
- [ ] Keep state aliases for `list` only. Remove their drift-reading role
- [ ] Rewrite `/spec-status` in all four providers: two questions become one
      (content), plus the description-edited line
- [ ] Tests: a ticket moved by hand reports nothing (stays-silent);
      description-edit warning still fires
- [ ] Run typecheck + tests — green
