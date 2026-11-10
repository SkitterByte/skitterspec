---
github_issue_id: "#158"
---

# Phase 5 — Tracker seam + GitHub ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** on push, a member's GitHub issue becomes a sub-issue of its epic's.

## Tasks

- [ ] provider-kit seam `setParent(memberIssue, epicIssue)`, absent → the push
      says the provider cannot express it and carries on
- [ ] The epic pushes as an issue with no phase sub-issues
- [ ] GitHub: add the member issue as a sub-issue of the epic issue (nesting
      keeps its phase sub-issues under it); verify reads it back
- [ ] An unlinked epic or member: report, never mint the other
- [ ] Tests against the GitHub fake: link set, idempotent re-push, member moved
      to another epic re-parents
