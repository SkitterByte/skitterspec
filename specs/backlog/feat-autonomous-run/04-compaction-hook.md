---
github_issue_id: "#299"
---

# Phase 4 — Compaction hook ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a compaction during an autonomous run is recorded against the phase
it happened in; proven by hook tests.

## Tasks

- [ ] Add `.claude/hooks/run-compact.cjs` (`PreCompact`): calls
      `spec-env run compacted` when a run is active in this worktree
- [ ] Fail open and silent on every cannot-tell: no engine, no run, crash,
      timeout
- [ ] Install and register it in `init` / `update` beside `review-gate.cjs`
- [ ] Stays-silent test: no active run means no write and exit 0
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
