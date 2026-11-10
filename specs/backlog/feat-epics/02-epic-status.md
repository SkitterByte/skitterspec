---
github_issue_id: "#155"
---

# Phase 2 — `epic status`: waits, waves, ready-now ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec epic status <epic> [--json]` reports members, ready-now,
blocked-by, cannot-tell and waves from members' headers alone.

## Tasks

- [ ] Find members: every spec in any bucket on the base branch whose `Epic:`
      names it (and in-flight worktrees' own copies, as `status` reads them)
- [ ] Resolve each wait on positive signals only: spec in `complete/` on base,
      or its phase heading ✅ there; unknown spec → cannot-tell
- [ ] Layer members into waves; report a cycle by naming it
- [ ] Ready-now = backlog members whose waits are all met; free lanes from
      `Lanes:` minus in-flight members
- [ ] Human output in the report-block shape; `--json` with the same answer
- [ ] Tests: the skitterload plan rebuilt from fixture headers reproduces its
      waves and sync point; a cycle; a missing member (cannot-tell, stays
      silent on accusation); a stays-silent test for a healthy unusual case
      (a wait on a spec outside the epic)
