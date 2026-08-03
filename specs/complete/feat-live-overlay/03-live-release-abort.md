# Phase 3 — `live release` + `live abort` + `/spec-live main` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** End a live session cleanly. `release` returns the primary checkout to
base and re-isolates the branch (unfinished session); `abort` force-recovers from
a crash using the receipt. `/spec-live main` is the release front door. Proven by
planner tests including the crash-recovery path.

## Tasks

- [x] Add `planRelease(spec, config, ctx)` to `env/live.js` — pure. Requires the
      primary checkout clean (fixes committed to the branch first; refuses if dirty).
      Plan: `git -C <primary> checkout <base>` → re-attach the branch to its worktree
      `git -C <worktree> switch <branch>` → clear the receipt. No-ops when already on
      base; refuses if a *different* spec holds the instance.
- [x] Add `planAbort(config, ctx)` — pure crash-recovery, driven by the receipt.
      Plan: `git -C <primary> checkout <base>` (skipped if already on base) →
      re-attach the branch to its worktree → clear the receipt. Guards: refuse (with
      guidance) if there's no receipt but the primary is off-base; **refuse on a
      dirty tree** — surface the work, never discard it.
- [x] Implement `release` and `abort` in `specEnvLive` (`cli.js`) — probe git,
      call the planner, execute, clear the receipt. Added a shared
      `resolveSpecWithWorktree` helper (also used by `take`).
- [x] Extend the `/spec-live` skill: `/spec-live main` → `spec-env live release`
      (resolves the live spec from the receipt), mirroring `/spec-connect main`;
      documented `abort` as the crashed/stale-session recovery path.
- [x] Add tests: `env-live.test.js` — `planRelease` (happy / no-op / wrong-spec /
      dirty / no-worktree) and `planAbort` (recover / stale-receipt / dirty-refuse /
      no-receipt no-op / no-receipt refuse); `cli-spec-env-live.test.js` — live-git
      release (round-trips base↔branch, clears receipt), release dirty-refusal, and
      abort (dirty-refuse then recover). `pnpm test` green — 371 pass, 0 fail.

## Notes

`release` is the "didn't finish" exit; merging is Phase 4 via `/spec-complete`.
Keep `abort` conservative — it's the only path that can `reset --hard`, so it must
prove (clean tree or receipt-matched HEAD) before doing so.
