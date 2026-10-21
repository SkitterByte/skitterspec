# Phase 4 — `release deployed` / `release complete` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a host's CI reports each deploy by env key, and finishes the release
when it is done.

## Tasks

- [ ] `release deployed <version> <env> [--series <prefix>]` maps the env key to
      a stage and moves the release. An unknown env refuses and names the
      configured keys. A backwards move warns via `stageOrderWarning`.
- [ ] `release complete <version>` is idempotent on an already-complete release.
- [ ] Require `--series` when a version is ambiguous across pipelines, and never
      guess.
- [ ] Tests: an unknown env; an ambiguous version; a backwards move warning but
      applying; a double complete.
- [ ] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.
