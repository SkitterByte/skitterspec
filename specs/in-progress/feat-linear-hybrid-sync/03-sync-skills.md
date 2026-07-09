# Phase 3 — Sync skills (status/pull/push) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Add the three git-like skills as thin wrappers over the `spec-sync`
CLI, registered so they ship with the package.

## Tasks

- [x] Author `assets/skills/spec-status/SKILL.md` — read-only. Discover MCP,
      run `spec-sync status`, print per-field divergence (local-only / remote-only
      / conflict / in-sync). Changes nothing. Opt-in: clear message + exit if no
      `linear.config.json`.
- [x] Author `assets/skills/spec-pull/SKILL.md` — `spec-sync pull [--force]`;
      explain the refuse-on-conflict behaviour and the `--force` + backup escape
      hatch. Mirror house skill voice/frontmatter.
- [x] Author `assets/skills/spec-push/SKILL.md` — `spec-sync push [--force]`;
      document ownership (never pushes `pull` fields / `localOnlySections`),
      concurrency abort, `--force` + backup, and applying the blessed writes over MCP.
- [x] Register all three in the `SKILLS` array in `src/init.js` so
      `init`/`update` copy them into consumer projects (+ the "Done" message).
- [x] Add tests (`node --test`): extend `test/assets.test.js` / `test/init.test.js`
      to assert the three new `SKILL.md` files exist with valid frontmatter and
      are installed by `init`.
- [x] Run `npm test` — all green before the phase is done (183 pass, 0 fail).

## Notes

Skills stay thin — all logic is in `src/sync/`. Dog-fooding symlinks
(`.claude/skills/spec-{status,pull,push}` → `../../assets/skills/…`) are committed
on the branch; they surface in the primary checkout after the branch merges.

**Delivered / decisions (Phase 3):**

- **`spec-sync status` gained `--remote <file>`** so the read-only `/spec-status`
  skill can hand it the MCP-fetched project and get a true three-way divergence
  (local / Linear / base) with per-field sync direction — without it, status still
  falls back to local-vs-base. Keeps the skill thin.
- **The MCP boundary lives in the skills, the guard lives in the CLI.** Each skill
  fetches the project over MCP → temp file → runs `spec-sync <cmd> --remote`. Push
  additionally applies the engine-blessed writes back over MCP **after** the CLI's
  three-way guard passes (the file adapter is the hand-off). Follow-up worth
  tracking: a plan/apply split so the base only advances once the live Linear write
  confirms (today the CLI rewrites the base then the skill writes Linear; on a write
  failure, re-run `/spec-pull` to reconcile).
