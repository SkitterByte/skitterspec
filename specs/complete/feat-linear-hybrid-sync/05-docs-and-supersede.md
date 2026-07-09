# Phase 5 — Docs + supersede ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Document adoption via the config and confirm the superseded spec is
cleanly retired.

## Tasks

- [x] Update `README.md`: a "Linear hybrid sync" usage note — the Linear↔spec
      model (Project/Milestone/Issue mapping), the opt-in config, the git-like
      `/spec-status` → `/spec-pull` → refine → `/spec-push` lifecycle, and the
      `--force` + backup escape hatch.
- [x] Ensure `specs/.core/linear.config.json.example` is committed and every
      field documented (mapping/state/path/branch/ownership).
- [x] Add a pointer from `assets/rules/spec-planning.md` (or a new
      `assets/rules/linear-sync.md`) to the sync commands, kept in house style.
- [x] Confirm `feat-spec-from-issue` is cancelled in `specs/cancelled/` with a
      `superseded by` reason (done at spec creation) — cross-link this spec.
- [x] Add tests (`node --test`): assert the `.example.json` ships and README
      mentions the new commands (guards against drift).
- [x] Run `npm test` — all green before the phase is done (187 pass, 0 fail).

## Notes

**`.gitignore` decision (resolved):** `{sync.backupDir}` (default
`specs/.core/linear-backups/`) is `--force` recovery — **gitignored** (per-machine
reflog, not shared). `{sync.baseDir}` (default `specs/.core/linear-base/`) **is
committed** — each worktree carries its own base for an accurate three-way compare.
Added the ignore line to `.gitignore` and a "What to commit" section to
`linear.config.md`.

**Delivered (Phase 5):**

- **README** gained a "Linear hybrid sync" section: the Project/Milestone/Issue
  mapping, the opt-in gate, the `/spec-status → /spec-pull → refine → /spec-push`
  lifecycle, field ownership, the `--force` + backup escape hatch, and the
  commit-base/ignore-backups rule. Closes with the supersede note vs the cancelled
  one-way intake design.
- **`assets/rules/spec-planning.md`** gained a house-style pointer paragraph after
  the isolation block, linking the three sync skills + the `/spec`·`/spec-go`
  Linear paths, and pointing at `linear.config.md` for the full reference.
- **Config template + docs** confirmed shipped under `assets/core/` (init copies
  them to the consumer's `specs/.core/`); every field is documented in
  `linear.config.md`, now with the commit/ignore guidance.
- **Supersede confirmed**: `feat-spec-from-issue` header already reads
  "Cancelled … superseded by … (feat-linear-hybrid-sync)"; this spec's Decision 1
  cross-links back. Both directions in place.
- Two drift-guard tests added (template ships + valid JSON; README names all three
  commands + the config).
