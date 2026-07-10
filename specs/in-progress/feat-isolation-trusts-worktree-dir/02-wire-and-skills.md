# Phase 2 — Wire into provision + init + skills ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The helper runs automatically wherever a worktree is created, and the
skills trust the root for the live session — so an adopter never hand-grants a
worktree folder again. End-to-end and tested.

## Tasks

- [ ] `src/cli.js specEnvUp`: after `resolveSpec`, call
      `ensureWorktreeDirTrusted(dir, path.dirname(spec.worktreePath))`; add a
      one-line report to the printed plan (`trusted: <root>` / `already trusted`),
      and warn on `reason:'malformed'`. Runs for both worktree-only and Docker
      specs.
- [ ] `src/init.js installIsolation`: when `enabled`, after writing
      `env.config.json`, resolve the absolute worktree root (expand the config's
      `worktree.root` via `resolve.js` `repoInfo` + `expandTokens`, then
      `path.resolve(dir, …)`) and call the helper; fold the result into the init
      `report`.
- [ ] Update `assets/skills/spec-env/SKILL.md` and
      `assets/skills/spec-go/SKILL.md`: after provisioning, instruct running
      `/add-dir <absolute worktree root>` for the current session, and note the
      persistent entry is written to `.claude/settings.local.json` (gitignored).
- [ ] Confirm `/spec-env-down` is unchanged (entry intentionally left in place) —
      add a one-line code/comment note where teardown is planned so the omission
      reads as deliberate.
- [ ] Extend `test/` (the existing spec-env `up` and init tests): assert the
      absolute root lands in `settings.local.json` on `specEnvUp` and on
      `init --isolation`, that a pre-existing `allow` array survives, and that a
      second `up` is a no-op. Add a grep-style assertion that both SKILL.md files
      mention `/add-dir`. Run typecheck + `npm test` — green before done.

## Notes

Isolation-off invariant: `installIsolation` already returns early when not
enabled, and `specEnvUp` only runs under the isolation engine — so no settings
write happens without `env.config.json`. Keep it that way (no new call sites
outside these two).
