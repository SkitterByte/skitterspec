---
github_issue_id: "#28"
---

# Phase 4 — `release deployed` / `release complete` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a host's CI reports each deploy by env key, and finishes the release
when it is done.

## Tasks

- [x] `release deployed <version> <env> [--series <prefix>]` maps the env key to
      a stage and moves the release. An unknown env refuses and names the
      configured keys. A backwards move warns via `stageOrderWarning`.
- [x] `release complete <version>` is idempotent on an already-complete release.
- [x] Require `--series` when a version is ambiguous across pipelines, and never
      guess.
- [x] Tests: an unknown env; an ambiguous version; a backwards move warning but
      applying; a double complete.
- [x] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

- `--series <prefix>` narrows by exact tag prefix; a full tag
  (`skitterspec@1.1.0`) also names the series. With one pipeline, a bare
  version is that pipeline's. An `@`-tag no pipeline claims is a no-op (exit
  0), as for `create`.
- Envs are reused as a ladder for `stageOrderWarning` (`{key, state: stage}`).
  A current stage no env names (the pipeline's first stage, or a rename) is
  cannot-tell and stays silent.
- The fake Linear in `cli-release.test.js` now persists stage and
  `completedAt`, and keeps the first `completedAt` on a repeat, as Linear does.
