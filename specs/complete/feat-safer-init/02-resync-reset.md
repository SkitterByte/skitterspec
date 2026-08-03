# Phase 2 — Resync + reset engine (with the hard guard) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `resync` updates pristine + missing managed files and keeps customized
ones; `reset` removes-and-recreates the managed set behind a hard guard that can
never touch spec content or active config — proven by fixtures.

## Tasks

- [x] `resync(dir, opts)`: per managed file via `managedState` — `missing` →
      create; `pristine` → update to latest (skip if bundled unchanged);
      `customized` → keep + `report.customized` (unless `force`). Refreshes the
      CLAUDE.md marked section; updates the manifest.
- [x] `assertSafeToDelete(relPath, managedSet)`: refuses paths under
      `specs/{backlog,in-progress,complete,cancelled}/**`, active config
      (`env.config.json`, `linear.config.json`), and `linear-base/`/`linear-backups/`;
      and anything not in the managed set.
- [x] `reset(dir, opts)`: delete every manifest-listed file (each guarded) + strip
      the CLAUDE.md marked section, then reinstall fresh; reports removed/recreated.
- [x] `isExistingSetup(dir)`: true if any managed file, any spec folder, or the
      CLAUDE.md marker is present.
- [x] Tests (5): resync updates stale-pristine + keeps customized; resync recreates
      missing; reset recreates managed while leaving a planted in-progress spec +
      `env.config.json` untouched; `assertSafeToDelete` refuses spec/config/non-managed;
      `isExistingSetup` fresh vs set-up. Suite 292 green.

## Notes

`reset` is destructive by design (it *does* overwrite a customized managed file —
that's "start again"); the safety promise is only about **non-managed** content.
The confirm/flag gating lives in Phase 3 (CLI), not here.
