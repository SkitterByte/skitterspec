# Phase 3 — Sync skills (status/pull/push) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Add the three git-like skills as thin wrappers over the `spec-sync`
CLI, registered so they ship with the package.

## Tasks

- [ ] Author `assets/skills/spec-status/SKILL.md` — read-only. Discover MCP,
      run `spec-sync status`, print per-field divergence (local-only / remote-only
      / conflict / in-sync). Changes nothing. Opt-in: clear message + exit if no
      `linear.config.json`.
- [ ] Author `assets/skills/spec-pull/SKILL.md` — `spec-sync pull [--force]`;
      explain the refuse-on-conflict behaviour and the `--force` + backup escape
      hatch. Mirror house skill voice/frontmatter.
- [ ] Author `assets/skills/spec-push/SKILL.md` — `spec-sync push [--force]`;
      document ownership (never pushes `pull` fields / `localOnlySections`),
      concurrency abort, `--force` + backup.
- [ ] Register all three in the `SKILLS` array in `src/init.js` so
      `init`/`update` copy them into consumer projects.
- [ ] Add tests (`node --test`): extend `test/assets.test.js` / `test/init.test.js`
      to assert the three new `SKILL.md` files exist with valid frontmatter and
      are installed by `init`.
- [ ] Run `npm test` — all green before the phase is done.

## Notes

Skills stay thin — all logic is in `src/sync/`. Confirm the dog-fooding symlinks
(`.claude/skills/` → `assets/skills/`) surface the new skills locally.
