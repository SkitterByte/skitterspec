# Phase 3 — `live release` + `live abort` + `/spec-live main` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** End a live session cleanly. `release` returns the primary checkout to
base and re-isolates the branch (unfinished session); `abort` force-recovers from
a crash using the receipt. `/spec-live main` is the release front door. Proven by
planner tests including the crash-recovery path.

## Tasks

- [ ] Add `planRelease(spec, config, gitState)` to `env/live.js` — pure. Require
      the primary checkout clean (any last fixes committed to the branch first;
      refuse if dirty with a clear message). Plan:
      `git -C <primary> checkout <base>` → re-attach the branch to its worktree
      `git -C <worktree> switch <branch>` → clear the receipt.
- [ ] Add `planAbort(config, receipt)` — pure crash-recovery. From the receipt:
      `git -C <primary> checkout <base>` then `git -C <primary> reset --hard
      <baseMainCommit>` only if HEAD diverged; re-attach the branch to its worktree;
      clear the receipt. Guard: refuse (with guidance) if there's no receipt but the
      primary is off-base, or if uncommitted work exists on the primary that abort
      would discard — surface it rather than blowing it away.
- [ ] Implement `release` and `abort` in `specEnvLive` (`cli.js`), executing/
      printing the plan and clearing the receipt file.
- [ ] Extend the `/spec-live` skill: `/spec-live main` runs
      `spec-env live release <current-spec>` (resolve the live spec from the
      receipt), mirroring `/spec-connect main`; document `abort` as the recovery
      path for a crashed/stale session.
- [ ] Add tests: `env-live.test.js` — `planRelease` happy path + dirty refusal;
      `planAbort` restores `baseMainCommit`, refuses on unexpected uncommitted work,
      no-ops when already on base. Wire cases in `cli-spec-env-live.test.js`.
      `pnpm test` green.

## Notes

`release` is the "didn't finish" exit; merging is Phase 4 via `/spec-complete`.
Keep `abort` conservative — it's the only path that can `reset --hard`, so it must
prove (clean tree or receipt-matched HEAD) before doing so.
