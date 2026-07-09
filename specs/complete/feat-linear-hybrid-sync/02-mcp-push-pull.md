# Phase 2 — MCP adapter + push/pull execution ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Wire the engine to Linear via runtime-discovered MCP tools and
implement `spec-sync push|pull [--force]` with optimistic concurrency,
backup-before-force, and base-rewrite-on-success — proven with a **mocked MCP
boundary**.

## Tasks

- [x] Add `src/sync/mcp.js`: `discoverLinear(tools)` — resolves the Linear MCP
      tool names at runtime from the connected server (project/milestone/issue
      read + create + update, `updatedAt`/hash read). Returns a clean
      "Linear not connected — connect the `linear` MCP server" error object; the
      caller stops and does nothing destructive. Adds `makeAdapter(callTool,…)`.
- [x] Add `src/sync/pull.js`: three-way aware. Apply remote-only fields to the
      snapshot; on a non-force conflict, **refuse** and report the conflicting
      fields ("resolve or `--force`"). `--force` = remote wins after
      `backup('local', …)`. On success rewrite base + update frontmatter
      (`last_synced_at`, `spec_status`). (Body fields deferred — see Notes.)
- [x] Add `src/sync/push.js`: three-way aware, ownership-respecting. **Re-read
      remote `updatedAt`/hash immediately before writing**; if it moved past base,
      abort ("pull first") unless `--force`. Never write `pull` fields or
      `localOnlySections`. `--force` = local wins after `backup('remote', …)`.
      On success rewrite base.
- [x] Extend `src/cli.js`: `spec-sync push|pull` accept `--force`, resolve the
      target spec (arg or cwd), and print a git-like summary (fields written /
      skipped / backed up). Uses a `--remote <file>` file-backed adapter for local
      runs; live MCP is supplied by the Phase 3 skills.
- [x] Add tests (`node --test`): `test/sync-pull.test.js`, `test/sync-push.test.js`
      with a **fake MCP** (in-memory Project). Cover: remote-only apply, conflict
      refusal, `--force` + backup written, concurrency abort (remote moved),
      base rewritten after success, `pull`-field never pushed.
- [x] Add `test/sync-mcp.test.js`: discovery success and the not-connected stop
      path (no writes attempted).
- [x] Run `npm test` — all green before the phase is done (180 pass, 0 fail).

## Notes

MCP tool names are verified against the live Linear server during build and
encoded only in `src/sync/mcp.js` (resolves the Open questions in the overview).
The fake MCP in tests keeps the suite offline and deterministic.

**Delivered / decisions (Phase 2):**

- **Adapter seam.** `pull`/`push` take an injected `adapter` (`readProject` +
  `updateProject`) and an injected `timestamp` — no clock, no MCP knowledge. The
  CLI wires a `--remote <file>` file adapter; the Phase 3 skills wire the real one
  via `mcp.makeAdapter(callTool, discoverLinear(tools).tools)`.
- **`workflowState` normalization fix.** Local `spec_status` (bucket) and remote
  Linear state name are now both mapped to the lifecycle bucket via `config.states`
  (`normalize.bucketForState`), so the field only diverges when it truly changed.
- **Optimistic concurrency** = classifier divergence **or** a moved `updatedAt`
  (stored in `base.__meta`), plus a **re-read immediately before write** to catch a
  racer → `concurrent-write` abort.
- **Deferred: body-field write-back (denormalizer).** Pull applies only the
  frontmatter-mapped `pull`-owned fields (`workflowState`/`priority`/`labels`);
  `both`-owned body fields (`description`/`milestones`/…) still **refuse** on
  conflict and are reported as `deferred` on a forced/remote-only pull, with their
  base left **pending** (never falsely marked synced). Writing pulled body content
  back into markdown is tracked as a follow-up (see overview Open questions).
