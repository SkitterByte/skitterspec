# Phase 1 — Config + engine core (the seam) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Ship the config schema and the pure three-way sync engine
(`normalize` + `classify` + ownership) behind `spec-sync normalize|status`,
proven by fixture-driven unit tests with **no live MCP**.

## Tasks

- [ ] Define the config schema: create `specs/.core/linear.config.json.example`
      with the full documented default (`linear`, `mapping`, `states`,
      `snapshot`, `branch`, `sync.baseDir`/`backupDir`/`fieldOwnership`/
      `localOnlySections`). Every field commented in an adjacent doc block.
- [ ] Add `src/sync/config.js`: `loadLinearConfig(dir)` — reads
      `specs/.core/linear.config.json`, merges over defaults, validates enums
      (`fieldOwnership` ∈ `both|pull|push`), returns `{ config, present }`;
      `present:false` when the file is absent (opt-in gate — never throws on absence).
- [ ] Add `src/sync/normalize.js`: `normalizeLocal(snapshotDir, config)` and
      `normalizeRemote(project, config)` — both produce the **same field set**
      (`description`, `milestones`, `phaseBodies`, `acceptanceCriteria`,
      `taskBreakdown`, `workflowState`, priority/labels/etc. per config). Pure
      functions; `localOnlySections` stripped from the local field set.
- [ ] Add `src/sync/compare.js`: `classify(local, remote, base, config)` — per
      field returns `unchanged | local-only | remote-only | conflict`, honouring
      `fieldOwnership` (a `pull` field never reports as pushable; a `push` field
      never as pullable). Stable field hashing for change detection.
- [ ] Add `src/sync/base.js`: `readBase(dir, identifier, config)`,
      `writeBase(...)`, and `backup(side, dir, identifier, config)` writing into
      `{sync.backupDir}` with a collision-safe name (no `Date.now()` in engine —
      timestamp passed in or derived from git).
- [ ] Extend `src/cli.js`: add a `spec-sync` command dispatch with `normalize`
      (snapshot dir → normalized JSON on stdout) and `status` (prints per-field
      divergence for a spec; read-only). Both no-op with a clear message when
      config is absent.
- [ ] Add tests (`node --test`): `test/sync-config.test.js` (defaults, merge,
      enum validation, absent = opt-out), `test/sync-compare.test.js` (all four
      classifications + ownership enforcement via fixtures), `test/sync-normalize.test.js`
      (local/remote produce identical field sets; `localOnlySections` stripped).
- [ ] Run `npm test` — all green before the phase is done.

## Notes

Engine must be deterministic and MCP-free — Phase 2 supplies the Linear
Project/milestone objects it normalizes. `Date.now()`/`Math.random()` are avoided
in `src/sync/` so tests are reproducible; callers pass timestamps.
