# Phase 3 — Teardown: `spec-env down` + `/spec-env-down` skill ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-env down <spec> [--keep-volumes] [--force]`
evaluates the dirty/unpushed guards, plans a config-driven pre-drop backup, and
**prints** the `docker compose down` / `git worktree remove` commands, then
frees the slot — idempotent and non-destructive without cause. A
thin `/spec-env-down` skill executes the printed side effects.

## Tasks

- [x] Add `src/env/teardown.js`: `planDown(spec, config, flags, { worktreeState,
      timestamp })` — pure planner. `worktreeState` (`{ dirty, unpushed }`) is
      supplied by the caller (queried via git), so the planner stays side-effect
      free. Returns `{ blocked, reason, commands, backupCommand, volumesDropped }`.
      **Guards (no Warp archive step — the opener is stateless):** if
      `guards.refuseTeardownIfDirty` && dirty, or
      `guards.refuseTeardownIfUnpushed` && unpushed → `blocked` with a clear
      reason, unless `flags.force`.
- [x] Backup + volume logic in the plan: unless `--keep-volumes`, the
      `docker compose down` includes `--volumes`; when `docker.backupCommand` is
      set, emit a pre-drop backup command writing to
      `.spec-env/backups/{slug}-{timestamp}.dump` (skip with a note when unset).
      `--keep-volumes` → plain `down`, no backup, no drop.
- [x] Wire `spec-env down` into `src/cli.js`: query git for the worktree's
      dirty/unpushed state, build the plan; if `blocked`, print the reason + the
      `--force` hint and change nothing; else print the commands (backup → down →
      `git worktree remove`) and `freeSlot`.
      Idempotent: spec not in the registry / worktree already gone → clean no-op
      with a clear message.
- [x] Write `assets/skills/spec-env-down/SKILL.md` (house format): resolve the
      spec; run `skitterspec spec-env down <spec> [flags]`; if the CLI reports a
      guard block, relay it and stop (offer `--force`); else execute the printed
      backup/`docker compose down`/`git worktree remove` commands;
      confirm what was removed (worktree, containers, volumes|kept, slot freed,
      backup path). Idempotent messaging when already torn down.
- [x] Symlink the skill into `.claude/skills/spec-env-down` →
      `../../assets/skills/spec-env-down`.
- [x] Add tests (`node --test`): `test/env-teardown.test.js` — guard blocks
      (dirty, unpushed) and `--force` override; `--keep-volumes` omits
      backup/drop; `backupCommand` set vs unset; slot freed after a successful
      plan; idempotent no-op when the spec is absent from the registry.
- [x] Run `npm test` — all green before the phase is done.

## Notes

Volumes are the only destructive action — default to dropping (so a torn-down
spec reclaims disk) but always back up first when a `backupCommand` is
configured. The planner never runs git/docker; the CLI queries git state and the
skill executes. Keep the "already gone" path a friendly no-op, never an error.
