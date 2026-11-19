---
github_issue_id: "#259"
---

# Phase 4 — Planner logic to pure tests, then confirm the target ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** CLI-over-git tests that only check planning become pure tests, and
the Windows run is under 5 minutes. Proven by the final measurement.

## Tasks

- [ ] From the re-measured ranking, mark each slow CLI test as either
      **planner-only** (its assertions are about a plan's text or JSON) or
      **git-behaviour** (ranges, worktrees, remotes, real refusals).
- [ ] Rewrite the planner-only ones against the pure planners, keeping every
      assertion. Keep at least one real-git test per CLI verb.
- [ ] Re-measure on the VM. Under 5 minutes completes the spec. Otherwise,
      record the gap and what dominates it in the Changelog.
- [ ] Run `pnpm test`, green. Confirm on the VM too.
