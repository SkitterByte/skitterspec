---
github_issue_id: "#42"
---

# Phase 3 — assignable identity, refusal skipped ✅

> **Status:** Done

**Goal:** a fresh machine's `/spec-start` assignment works without the
`whoami --set` workaround, and a refused assignee costs one warning line, not
the whole push.

- [x] `readViewer()` answers with the uniqueName/email in the `id` slot
      (GUID only when no account property exists), so a derived `whoami`
      caches a value `System.AssignedTo` accepts.
- [x] `searchUsers()` surfaces the same assignable value as each user's `id`,
      so `/spec-claim --to` stamps something writable.
- [x] `apply` retries a write Azure refused for an unknown Assigned To
      **without the assignee**, reports the skip, and lands the rest.
- [x] Tests green: `readViewer answers with the assignable identity first`,
      `searchUsers surfaces the assignable identity, not the vssps GUID`,
      `an assignee the tracker refuses is skipped and reported; the apply
      still lands` (fake adapter rejects GUIDs in `System.AssignedTo`).
