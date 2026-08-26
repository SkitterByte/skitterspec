# Phase 2 — `spec-env prune` CLI subcommand + tests ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-env prune [--older-than <days>] [--dir <path>]`
enumerates namespace volumes, computes live slugs, and prints an orphan report +
`docker volume rm` commands for the skill to execute after confirmation.

## Tasks

- [x] Add `specEnvPrune(dir, config, flags)` in `packages/common/src/cli.js`,
      alongside `specEnvDown`.
- [x] Enumerate volumes via
      `docker volume ls --format '{{.Name}}' --filter name=${repoSlug}_`
      (`listRepoVolumes`; captures stderr). Docker-not-available → clear,
      non-fatal message.
- [x] Build `liveSlugs` from **existing worktrees** — `git worktree list
      --porcelain` for live paths, then resolve every spec folder (primary
      checkout **and** each worktree, via `resolveSpec` `searchDirs`) and keep
      those whose resolved `worktreePath` is live. Registry is **not** consulted
      for liveness. (Extracted the decision into pure `liveSlugsForSpecs`.)
- [x] After planning, free the slot of any spec whose volume is reaped
      (`reconcileRegistry` → `writeRegistry`) so the registry reconciles.
- [x] For `--older-than`, fetch `createdAt` via `docker volume inspect`
      (`volumeCreatedAt`) only for candidate volumes; pass through to `planPrune`.
- [x] Print `spec-env prune: N orphaned volume(s)` with the volume list + the
      `docker volume rm` commands; clean "no orphaned volumes" when empty; the
      standard not-enabled message when `env.config.json` is absent.
- [x] Register `prune` in the `spec-env` dispatch, HELP block, and the usage
      string.
- [x] Add tests: `env-prune.test.js` extended with `liveSlugsForSpecs` +
      `reconcileRegistry` cases; new `cli-spec-env-prune.test.js` for the
      not-enabled / no-op / `--older-than` wiring paths. **Full suite 416/416.**
- [x] End-to-end smoke: created a real orphan volume + a live-spec decoy volume;
      `spec-env prune` flagged only the orphan and protected the live spec.

## Notes

The CLI is the only IO seam: it does docker/git enumeration and prints; the
removal itself is executed by the skill after user confirmation (Phase 3), same
as `spec-env down` prints commands the skill runs. Because liveness keys off
worktrees (not the registry), a declined/aborted teardown that left a stale slot
*and* its volume is correctly reaped — and prune frees that stale slot as it
goes, so the registry converges back to what actually exists.

**Discovered during Phase 2:** an in-progress spec lives on its *worktree
branch*, not the primary checkout, so liveness scanning must resolve spec folders
found **inside the live worktrees too** (`resolveSpec` `searchDirs`) — otherwise
the active spec's own DB volume is misread as an orphan. The smoke test caught
this ("0 live specs protected"); fixed by scanning primary + all worktrees.
