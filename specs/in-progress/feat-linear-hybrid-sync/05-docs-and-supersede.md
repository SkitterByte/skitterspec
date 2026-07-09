# Phase 5 — Docs + supersede ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Document adoption via the config and confirm the superseded spec is
cleanly retired.

## Tasks

- [ ] Update `README.md`: a "Linear hybrid sync" usage note — the Linear↔spec
      model (Project/Milestone/Issue mapping), the opt-in config, the git-like
      `/spec-status` → `/spec-pull` → refine → `/spec-push` lifecycle, and the
      `--force` + backup escape hatch.
- [ ] Ensure `specs/.core/linear.config.json.example` is committed and every
      field documented (mapping/state/path/branch/ownership).
- [ ] Add a pointer from `assets/rules/spec-planning.md` (or a new
      `assets/rules/linear-sync.md`) to the sync commands, kept in house style.
- [ ] Confirm `feat-spec-from-issue` is cancelled in `specs/cancelled/` with a
      `superseded by` reason (done at spec creation) — cross-link this spec.
- [ ] Add tests (`node --test`): assert the `.example.json` ships and README
      mentions the new commands (guards against drift).
- [ ] Run `npm test` — all green before the phase is done.

## Notes

`.gitignore` note: `{sync.backupDir}` (the reflog under `.spec-sync/backups`) is
local recovery — decide in this phase whether to commit or ignore it; base
sidecars under `{sync.baseDir}` **are** committed (each worktree carries its base).
