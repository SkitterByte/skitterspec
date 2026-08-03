---
linear_project_id: "4590efe4-001d-4608-932a-4b345c948a96"
linear_identifier: "SKI-safer-init"
linear_url: "https://linear.app/skitterspec/project/safer-init-detect-existing-setup-offer-resync-reset-leave-27057035fe49"
spec_status: "backlog"
---

# Safer init: detect existing setup, offer resync / reset / leave

> **Type:** Feature
> **Status:** In Progress — all phases done, ready for /spec-complete
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-03
> **Area:** packages/common/src/init.js, packages/common/src/cli.js, packages/common/src/prompts.js, packages/common/assets/skills/spec-init/SKILL.md
> **Stack:** worktree

## Problem

Running `skitterspec[-linear] init` (or `/spec-init`) on a repo that's **already
set up** is opaque and slightly dangerous: init silently skips existing files and
prints a wall of `skipped:` lines with no signal that the repo was already
initialized, and the only escape hatch is `--force`, which clobbers *everything*
(including a user's filled-in `spec-planning.md` conventions). A user who didn't
realize the repo was set up gets no chance to stop, resync, or reset cleanly.

## Decisions

1. **Detect eagerly.** If **any** managed file is already present (a spec skill,
   a rule, a `specs/` folder, the CLAUDE.md spec-workflow marker), treat the repo
   as "already set up" and branch into the choice below — this also catches
   half-installed setups. (Rejected stricter "all pieces present" — a partial
   install is exactly when repair matters.)
2. **Three paths on an existing setup: Resync / Start again / Leave alone.**
   Interactive → prompt; non-interactive → see Decision 6.
3. **A committed install manifest underpins safety.** Every install/resync writes
   `specs/.core/.skitterspec-manifest.json` — a map of each managed file → the
   content hash we wrote. It's the baseline that distinguishes "an old version we
   own" from "a file the user edited". Committed so a teammate's resync shares the
   baseline. (Rejected a category heuristic and blind overwrite — neither can tell
   a user edit from a stale version.)
4. **RESYNC is manifest-aware and never clobbers edits.** For each managed file:
   missing → create; present and hash == manifest → we own it, update to the
   latest bundled + re-record; present and hash != manifest → **customized, keep**
   and report it. `--force` overrides (clobbers customized). CLAUDE.md keeps its
   existing marker-section refresh (not a hashed file entry).
5. **START AGAIN is manifest-driven with a hard guard.** Remove exactly the files
   the manifest lists + the CLAUDE.md marked section, then reinstall fresh. A
   **hard guard** refuses to delete anything under
   `specs/{backlog,in-progress,complete,cancelled}/**` or active config
   (`env.config.json`, `linear.config.json`, `linear-base/`, `linear-backups/`) —
   defense-in-depth even though the manifest never lists those. Interactive: a
   **second confirm**; non-interactive: requires `--reset --yes`.
6. **Non-interactive default stays safe + backward-compatible.** With `--yes` / no
   TTY and no explicit action flag, keep today's **create-missing** behaviour (add
   absent files, never clobber). `--resync` / `--reset` opt into the stronger
   actions; `--force` and the `update` command keep working (`update` = resync).
   (Rejected a leave-alone or auto-resync default — the first breaks idempotent-add
   CI, the second mutates files in CI unexpectedly.)

## Solution overview

- **Manifest module** (`init.js`): `writeManifest`/`readManifest`; after writing a
  managed file, record `{ relPath: sha1(content) }`. A classifier
  `managedState(target)` → `missing | pristine | customized` by comparing the
  on-disk hash to the manifest.
- **Detection**: `isExistingSetup(dir)` — true if any manifest-class path exists
  (or the CLAUDE.md marker is present).
- **Actions**: `resync(dir, opts)` (Decision 4) and `reset(dir, opts)` (Decision
  5, with `assertSafeToDelete(path)` enforcing the hard guard). Plain `init` on a
  fresh repo is unchanged.
- **CLI** (`cli.js`): on `init`, if `isExistingSetup` → interactive prompt (3
  choices, default Leave alone) or the flag-selected action; non-interactive with
  no flag → create-missing. New flags `--resync`, `--reset`; `--reset` demands
  `--yes` (or the second interactive confirm). Refreshed `--help`.
- **Skill/docs**: `/spec-init` SKILL.md documents the re-run behaviour; dists
  rebuilt so both `skitterspec` and `skitterspec-linear` ship it.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Install manifest + managed-state classifier | ✅ | [01-manifest.md](01-manifest.md) |
| 2 | Resync + reset engine (with the hard guard) | ✅ | [02-resync-reset.md](02-resync-reset.md) |
| 3 | CLI detection, prompt, flags + /spec-init docs | ✅ | [03-cli-and-docs.md](03-cli-and-docs.md) |

## Open questions

- [ ] Whether to migrate repos that predate the manifest (no manifest file yet):
      on first resync, treat all present managed files as `customized` (safe —
      keeps them) and write the manifest from the current bundled hashes. Confirm
      in Phase 1.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-03 | Ready | backlog | Reuben Greaves |
| 2026-08-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-03 — Spec created; detection heuristic, manifest-based resync, guarded
  reset, and CI default resolved in Phase A grilling.
- 2026-08-03 — Phase 1 done: install manifest (`specs/.core/.skitterspec-manifest
  .json`) of managed-file hashes, recorded on write + flushed each run (with
  pre-manifest migration); `managedState` classifier + `managedTargets`. 4 fixtures;
  suite 287 green.
- 2026-08-03 — Phase 3 done: `init` detects an existing setup and offers
  resync/reset/leave (interactive prompt or `--resync`/`--reset` flags; `--reset`
  needs `--yes`); non-interactive default stays create-missing; `update` → resync;
  `/spec-init` docs + HELP updated. 5 fixtures; suite 297 green; CLI live-smoked.
  **All 3 phases done — ready for /spec-complete.**
- 2026-08-03 — Phase 2 done: `resync` (update pristine + add missing, keep
  customized), `reset` (guarded manifest-driven remove + recreate), `isExistingSetup`
  detection, `assertSafeToDelete` hard guard. 5 fixtures; suite 292 green. **Fix
  found via the guard:** `flushManifest` now scopes the manifest to managed files
  only (was capturing a live `env.config.json` written through `writeFile`).
