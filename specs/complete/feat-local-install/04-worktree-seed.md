---
github_issue_id: "#238"
---

# Phase 4 — Seed the local install into worktrees ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a Claude Code session started inside a local-mode spec worktree has
the skills, commands, rules, hooks and CLAUDE block.

## Tasks

- [x] When the manifest scope is `local`, add implicit seed steps for the
      managed `.claude/` directories, `settings.local.json` and
      `CLAUDE.local.md` to `bootstrap`'s plan.
- [x] Extend the seed step to directories (symlink; recursive copy as the
      fallback where symlinks are unavailable).
- [x] Respect existing worktree files: an existing path is skipped, as today.
- [x] Tests: local-mode bootstrap seeds each path; team mode seeds nothing
      extra; the copy fallback covers a directory. Run `pnpm test`.

## Notes

`settings.local.json` already carries the trusted worktree root, so seeding
it as a symlink keeps one source of truth.
