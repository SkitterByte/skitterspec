---
github_issue_id: "#183"
---

# Phase 1 — Transcript digest by repo and branch ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec tada --json` lists the window's sessions grouped by
repo and branch, proven against fixture transcripts.

## Tasks

- [x] Add `packages/common/src/tada/window.js` — parse `--since`
      (`yesterday`, weekday, `YYYY-MM-DD`, default local midnight) into
      instants
- [x] Add `tada/transcripts.js` — stream `~/.claude/projects/*/*.jsonl`
      (root injectable), skip files whose mtime predates the window, keep
      entries whose timestamp falls inside it
- [x] Filter noise (Decision 7): `isMeta`, sidechains, non-string content,
      caveats, system reminders; keep slash commands as events; cap prompt
      length and per-session count
- [x] Resolve each cwd to its repo via `--git-common-dir`; fall back per
      Decision 3, adding a `cannot tell` note
- [x] Wire `skitterspec tada [--since] [--here] [--json]` into `cli.js`
      (sessions only for now)
- [x] Tests: fixture jsonl covering UTC-midnight crossing, a worktree cwd
      folding into its repo, a vanished cwd, meta/caveat noise, caps; a
      stays-silent test for a healthy day with no activity (empty digest,
      exit 0); run `pnpm typecheck` and `pnpm test` — green

## Notes

The transcript format is Claude Code's, not ours — read defensively, skip a
malformed line rather than fail, and name the blind spot beside the reader
(`.claude/rules/negative-checks.md`).
