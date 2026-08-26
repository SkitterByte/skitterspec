# Phase 2 — `spec-env prune` CLI subcommand + tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env prune [--older-than <days>] [--dir <path>]`
enumerates namespace volumes, computes live slugs, and prints an orphan report +
`docker volume rm` commands for the skill to execute after confirmation.

## Tasks

- [ ] Add `specEnvPrune(dir, config, flags)` in `packages/common/src/cli.js`,
      alongside `specEnvDown` (~line 324).
- [ ] Enumerate volumes via
      `docker volume ls --format '{{.Name}}' --filter name=${repoSlug}_`
      (reuse a captured-output exec helper like the existing git readers; capture
      stderr, don't swallow). Handle docker-not-available with a clear message.
- [ ] Build `liveSlugs` from **existing worktrees only** — parse
      `git worktree list --porcelain` (map branch → spec slug consistent with
      `env/resolve.js`), cross-checked against `specs/in-progress/`. Do **not**
      use the registry for liveness (it is the thing that goes stale).
- [ ] After planning, for each reaped slug that still holds a registry slot, free
      it (`freeSlot` + `writeRegistry`) so the registry reconciles with reality.
- [ ] For `--older-than`, fetch `createdAt` via `docker volume inspect` only for
      candidate volumes; pass through to `planPrune`.
- [ ] Print `spec-env prune: N orphaned volume(s)` with the volume list and the
      `docker volume rm` commands; print a clean "nothing to prune" when empty.
      No-op with the standard message when `env.config.json` is absent.
- [ ] Register `prune` in the `spec-env` dispatch (~line 749) and add it to the
      usage string (`up|down|dev|connect|integrate|live|status|resolve` → add
      `prune`) at cli.js:955.
- [ ] Add tests in `packages/common/test/` (e.g. `env-prune-cli.test.js`) with
      stubbed exec: orphan detection end-to-end, live specs protected, no-op when
      disabled, docker-missing surfaced. Run `node --test` — green before done.

## Notes

The CLI is the only IO seam: it does docker/git enumeration and prints; the
removal itself is executed by the skill after user confirmation (Phase 3), same
as `spec-env down` prints commands the skill runs. Because liveness keys off
worktrees (not the registry), a declined/aborted teardown that left a stale slot
*and* its volume is correctly reaped — and prune frees that stale slot as it
goes, so the registry converges back to what actually exists.
