# Phase 1 — Stand up the skittership package (new repo) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A standalone `@skitterbyte/skittership` repo whose `init` installs the
commit skill, commit-message rule, and changelog/release generators into a
consumer project — including migrating an existing `skitterspec.config.json` —
with the ported release test suite green.

## Tasks

- [x] Create the sibling repo `skittership` and scaffold the package to mirror
      skitterspec's shape: `package.json` (name `@skitterbyte/skittership`, `bin`
      `skittership → bin/skittership.js`, `files ["bin","src","assets"]`, `type
      commonjs`, `engines node >=18`, dep `prompts`), `bin/skittership.js`,
      `src/{cli,init,config,prompts}.js`.
- [x] Move the release assets in (from skitterspec): `assets/skills/commit/SKILL.md`,
      `assets/rules/commit-messages.md`, `assets/scripts/generate-changelog.js`,
      `assets/scripts/generate-releases.js`, `assets/scripts/lib/git-commits.js`,
      `assets/scripts/lib/config.js`. Renamed all in-file `skitterspec.config.json`
      / product references to `skittership`.
- [x] Implement `skittership init [dir]`: copy the commit skill →
      `.claude/skills/commit/`, rule → `.claude/rules/commit-messages.md`,
      generators + `lib/` → `scripts/`, write `skittership.config.json`, and wire
      the npm `version` hook. Carry over the flags: `--changelog/--no-changelog`,
      `--releases/--no-releases`, `--changelog-file`, `--releases-file`,
      `--product-name`, `--version-hook/--no-version-hook`, `--yes/-y`, plus TTY
      prompts. (Also added a `## Release tooling` CLAUDE.md section.)
- [x] Implement config migration: if `skittership.config.json` is absent but a
      legacy `skitterspec.config.json` exists, rename it (preserving the
      `changelog`/`releases`/`versionHook` keys). Run before `loadConfig` in the
      CLI and at the top of `init()` so both paths carry values over; idempotent.
- [x] Point the config loader at the single filename `skittership.config.json`
      (no `skitterspec.config.json` runtime fallback — migration is init-time only).
- [x] Implement `skittership update [dir]` to re-sync the skill/rule/scripts while
      preserving `skittership.config.json`.
- [x] Port the release tests into skittership: `generate-releases.test.js`,
      `generate-changelog.test.js`, `git-commits.test.js`, `config.test.js`, and a
      rewritten `init.test.js` (asset copy, config write, version-hook wiring,
      migration + legacy carry-over). **62 tests pass** (`node --test`).
- [x] Run skittership's test command — `node --test` green (62/62). No separate
      typecheck: the package is plain zero-dep CommonJS, matching skitterspec.

## Notes

- This phase creates a separate repo; it does not modify skitterspec yet, so the
  two can be developed in parallel and skitterspec keeps working until Phase 2.
- Keep the generators zero-dependency CommonJS (the original design decision) so
  the copied `scripts/` need no install in the consumer project.
