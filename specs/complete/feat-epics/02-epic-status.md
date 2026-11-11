---
github_issue_id: "#155"
---

# Phase 2 — `epic status`: waits, waves, ready-now ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec epic status <epic> [--json]` reports members, ready-now,
blocked-by, cannot-tell, waves and sync points from members' headers alone.

## Tasks

- [x] Find members: every spec in any bucket on the base branch whose `Epic:`
      names it (and in-flight worktrees' own copies, as `status` reads them)
- [x] Resolve each wait on positive signals only: spec in `complete/` on base,
      or its phase heading ✅ there; unknown spec → cannot-tell
- [x] Layer members into waves; report a cycle by naming it
- [x] Ready-now = backlog members whose waits are all met; free lanes from
      `Lanes:` minus in-flight members
- [x] Human output in the report-block shape; `--json` with the same answer
- [x] Read a phase file's own `Waits on:` as a wait holding that phase only:
      reported as a sync point (met / not yet / cannot tell), never a wave edge
- [x] Tests: the skitterload plan rebuilt from fixture headers reproduces its
      waves and sync point; a cycle; a missing member (cannot-tell, stays
      silent on accusation); a stays-silent test for a healthy unusual case
      (a wait on a spec outside the epic)

## Notes

- Waits are read off the base branch by git (`ls-tree`, `grep`, `show`), not
  off the primary checkout's working tree, so a live overlay or an uncommitted
  edit there cannot meet a wait.
- The base package depends on no provider package, so `env/epic.js` keeps its
  own `parseWaitsOn`; a test holds it to sync-core's answer.
