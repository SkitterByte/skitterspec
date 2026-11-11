---
github_issue_id: "#158"
---

# Phase 5 — Tracker seam + GitHub ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** on push, a member's GitHub issue becomes a sub-issue of its epic's.

## Tasks

- [x] provider-kit seam `setParent(memberIssue, epicIssue)`, absent → the push
      says the provider cannot express it and carries on
- [x] The epic pushes as an issue with no phase sub-issues
- [x] GitHub: add the member issue as a sub-issue of the epic issue (nesting
      keeps its phase sub-issues under it); verify reads it back
- [x] An unlinked epic or member: report, never mint the other
- [x] `/spec-list` (GitHub) groups members under their epic's issue
- [x] Tests against the GitHub fake: link set, idempotent re-push, member moved
      to another epic re-parents

## Notes

- A member's description gains `Epic: <identifier>` (or the epic's name while
  it is unlinked), built into the projection like the related-incident line,
  so a spec that only gains an `Epic:` header still has a change to push and
  the parent link rides on it.
- `spec-sync list` used to drop every sub-issue as a phase; a member under an
  epic is a sub-issue now, so one whose parent is linked to an `epic-` spec is
  kept and grouped. An unknown parent stays hidden — a missing row, never a
  phase shown as a spec.
- Removing an `Epic:` header leaves the parent in place: the seam sets, and
  never clears, a link it cannot positively tell was its own.
