---
github_issue_id: "#248"
---

# Phase 2 — `complete.checks` and `spec-env checks` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a project can declare completion checks, and one engine verb runs
them in the spec's worktree and reports, always exiting 0.

## Tasks

- [x] Add `complete: { checks: [] }` to the config defaults; validate it is a
      list of strings (a malformed value warns and is treated as empty).
- [x] Add `spec-env checks [spec] [--json]`: resolve the spec (bare = the
      worktree you stand in), run each command with the worktree as cwd, and
      print per command `ok` / `failed (exit N)` with its output; `--json`
      carries the same. Nothing configured → `no completion checks
      configured`. Always exit 0.
- [x] Tests: runs in the worktree, reports a failing command without
      stopping the next, exits 0 either way; stays-silent with no key; a
      malformed key warns. Run `pnpm test`.
