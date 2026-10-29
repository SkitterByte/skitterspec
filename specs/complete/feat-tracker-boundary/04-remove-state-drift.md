---
github_issue_id: "#67"
---

# Phase 4 — Remove state drift ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `status` and `/spec-status` report what would push and whether the
description was edited, and no longer report a tracker state that differs
from the spec's.

## Tasks

- [x] Remove the state-drift comparison from `status` in GitHub, Linear and
      Azure `cli-sync.js` (and Jira's equivalent)
- [x] Keep state aliases for `list` only. Their drift-reading role went with the
      status line, and `remoteStateReading` stays for `list`'s rows
- [x] Rewrite `/spec-status` in all four providers: two questions become one
      (content), plus the description-edited line
- [x] Tests: a ticket moved by hand reports nothing (stays-silent);
      description-edit warning still fires
- [x] Run typecheck + tests — green
