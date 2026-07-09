# Phase 1 — Config + engine core (the seam) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Ship the config schema and the pure three-way sync engine
(`normalize` + `classify` + ownership) behind `spec-sync normalize|status`,
proven by fixture-driven unit tests with **no live MCP**.

## Tasks

- [x] Define the config schema: create `linear.config.json.example`
      with the full documented default (`linear`, `mapping`, `states`,
      `snapshot`, `branch`, `sync.baseDir`/`backupDir`/`fieldOwnership`/
      `localOnlySections`). Every field commented in an adjacent doc block.
- [x] Add `src/sync/config.js`: `loadLinearConfig(dir)` — reads
      `specs/.core/linear.config.json`, merges over defaults, validates enums
      (`fieldOwnership` ∈ `both|pull|push`), returns `{ config, present }`;
      `present:false` when the file is absent (opt-in gate — never throws on absence).
- [x] Add `src/sync/normalize.js`: `normalizeLocal(snapshotDir, config)` and
      `normalizeRemote(project, config)` — both produce the **same field set**
      (`description`, `milestones`, `phaseBodies`, `acceptanceCriteria`,
      `taskBreakdown`, `workflowState`, priority/labels/etc. per config). Pure
      functions; `localOnlySections` stripped from the local field set.
- [x] Add `src/sync/compare.js`: `classify(local, remote, base, config)` — per
      field returns `unchanged | local-only | remote-only | conflict`, honouring
      `fieldOwnership` (a `pull` field never reports as pushable; a `push` field
      never as pullable). Stable field hashing for change detection.
- [x] Add `src/sync/base.js`: `readBase(dir, identifier, config)`,
      `writeBase(...)`, and `backup(side, dir, identifier, config)` writing into
      `{sync.backupDir}` with a collision-safe name (no `Date.now()` in engine —
      timestamp passed in or derived from git).
- [x] Extend `src/cli.js`: add a `spec-sync` command dispatch with `normalize`
      (snapshot dir → normalized JSON on stdout) and `status` (prints per-field
      divergence for a spec; read-only). Both no-op with a clear message when
      config is absent.
- [x] Add tests (`node --test`): `test/sync-config.test.js` (defaults, merge,
      enum validation, absent = opt-out), `test/sync-compare.test.js` (all four
      classifications + ownership enforcement via fixtures), `test/sync-normalize.test.js`
      (local/remote produce identical field sets; `localOnlySections` stripped).
- [x] Run `npm test` — all green before the phase is done (160 pass, 0 fail).

## Notes

Engine must be deterministic and MCP-free — Phase 2 supplies the Linear
Project/milestone objects it normalizes. `Date.now()`/`Math.random()` are avoided
in `src/sync/` so tests are reproducible; callers pass timestamps.

**Delivered (Phase 1):**

- Config template ships as `assets/core/linear.config.json.example` +
  `assets/core/linear.config.md` (mirrors the `env.config` convention — `init`
  scaffolds them into a consumer's `specs/.core/`; the live
  `specs/.core/linear.config.json` stays absent so the feature is opt-in). Wired
  into `src/init.js` `CORE_FILES`.
- `classify` returns per-field `{ raw, status, pushable, pullable }`: `raw` is the
  three-way status; ownership then collapses it — a `pull` conflict → remote-only
  (remote wins, never pushable), a `push` conflict → local-only (local wins, never
  pullable); only a `both` field conflict surfaces as a true `conflict`. Fields
  that both moved off base to the **same** value converge to `unchanged`.
- `spec-sync status` compares local vs base only in Phase 1 (no live MCP); it
  prints a note that remote-vs-base divergence lands in Phase 2.
