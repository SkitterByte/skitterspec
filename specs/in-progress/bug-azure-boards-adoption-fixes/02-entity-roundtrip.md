---
github_issue_id: "#41"
---

# Phase 2 — read-back decodes Azure's storage transform ✅

> **Status:** Done

**Goal:** an intact mirror verifies clean: `"`, `>`, `<`, `&`, `'` round-trip,
and Azure's tag-token stripping no longer reads as drift — while a real
Boards-side edit is still reported.

- [x] `descriptionText()` entity-decodes the markdown branch (the inverse of
      Azure's store), so `preserve`, verify and the drift check all see the
      author's text.
- [x] The dialect's `canonicalForCompare` decodes entities and strips
      tag-shaped tokens on **both** sides, so the sanitiser's deletions —
      content Azure genuinely drops — compare as benign while word edits still
      accuse. Blind spot named beside the code.
- [x] Tests green: `a markdown description reads back entity-decoded`,
      `a stored round-trip through Azure's encoding verifies clean`,
      `a real Boards-side edit is still reported`.
