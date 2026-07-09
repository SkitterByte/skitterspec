# Phase 2 — MCP adapter + push/pull execution ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Wire the engine to Linear via runtime-discovered MCP tools and
implement `spec-sync push|pull [--force]` with optimistic concurrency,
backup-before-force, and base-rewrite-on-success — proven with a **mocked MCP
boundary**.

## Tasks

- [ ] Add `src/sync/mcp.js`: `discoverLinear(tools)` — resolves the Linear MCP
      tool names at runtime from the connected server (project/milestone/issue
      read + create + update, `updatedAt`/hash read). Returns a clean
      "Linear not connected — connect the `linear` MCP server" error object; the
      caller stops and does nothing destructive.
- [ ] Add `src/sync/pull.js`: three-way aware. Apply remote-only fields to the
      snapshot; on a non-force conflict, **refuse** and report the conflicting
      fields ("resolve or `--force`"). `--force` = remote wins after
      `backup('local', …)`. On success rewrite base + update frontmatter
      (`last_synced_at`, `spec_status`).
- [ ] Add `src/sync/push.js`: three-way aware, ownership-respecting. **Re-read
      remote `updatedAt`/hash immediately before writing**; if it moved past base,
      abort ("pull first") unless `--force`. Never write `pull` fields or
      `localOnlySections`. `--force` = local wins after `backup('remote', …)`
      (and/or a Linear comment). On success rewrite base.
- [ ] Extend `src/cli.js`: `spec-sync push|pull` accept `--force`, resolve the
      target spec (arg or cwd), and print a git-like summary (fields written /
      skipped / backed up).
- [ ] Add tests (`node --test`): `test/sync-pull.test.js`, `test/sync-push.test.js`
      with a **fake MCP** (in-memory Project). Cover: remote-only apply, conflict
      refusal, `--force` + backup written, concurrency abort (remote moved),
      base rewritten after success, `pull`-field never pushed.
- [ ] Add `test/sync-mcp.test.js`: discovery success and the not-connected stop
      path (no writes attempted).
- [ ] Run `npm test` — all green before the phase is done.

## Notes

MCP tool names are verified against the live Linear server during build and
encoded only in `src/sync/mcp.js` (resolves the Open questions in the overview).
The fake MCP in tests keeps the suite offline and deterministic.
