# Phase 2 — Resync + reset engine (with the hard guard) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `resync` updates pristine + missing managed files and keeps customized
ones; `reset` removes-and-recreates the managed set behind a hard guard that can
never touch spec content or active config — proven by fixtures.

## Tasks

- [ ] `resync(dir, opts)`: for each managed file use `managedState` — `missing` →
      create; `pristine` → overwrite to latest + re-record; `customized` → keep and
      add to a `report.customized` list (unless `opts.force`, which overwrites).
      Refresh the CLAUDE.md marked section as today. Update the manifest.
- [ ] `assertSafeToDelete(dir, relPath)`: throw unless the path is a known managed
      file; **always** refuse paths under
      `specs/{backlog,in-progress,complete,cancelled}/**` and active config
      (`env.config.json`, `linear.config.json`, `linear-base/`, `linear-backups/`).
- [ ] `reset(dir, opts)`: delete every manifest-listed file (each via
      `assertSafeToDelete`) + strip the CLAUDE.md marked section, then run a fresh
      install; report removed vs recreated. Never deletes a non-manifest path.
- [ ] `isExistingSetup(dir)`: true if any managed file exists or the CLAUDE.md
      marker is present (drives detection in Phase 3).
- [ ] Tests: resync updates a stale pristine file but keeps an edited one; resync
      adds a missing file; reset removes+recreates managed files while leaving a
      planted spec under `in-progress/` and an `env.config.json` untouched;
      `assertSafeToDelete` throws on a spec-content path. Typecheck + tests green.

## Notes

`reset` is destructive by design (it *does* overwrite a customized managed file —
that's "start again"); the safety promise is only about **non-managed** content.
The confirm/flag gating lives in Phase 3 (CLI), not here.
