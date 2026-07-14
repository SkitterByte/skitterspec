# Phase 2 — Strip release tooling out of skitterspec ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A skitterspec install is spec-only — no commit skill, no rule, no
generators, no release config or flags — with all release code and tests removed
and the remaining suite green.

## Tasks

- [x] Delete the moved assets from skitterspec: `assets/skills/commit/`,
      `assets/rules/commit-messages.md`, `assets/scripts/generate-changelog.js`,
      `assets/scripts/generate-releases.js`, `assets/scripts/lib/git-commits.js`,
      `assets/scripts/lib/config.js` (`git rm` removed the now-empty `scripts/`,
      `scripts/lib/`, `skills/commit/` dirs).
- [x] Remove the release config from `src/init.js`: the `changelog`/`releases`/
      `versionHook` handling, `releaseFromConfig`, `serializeConfig`, `writeConfig`,
      `installScripts`, `wireVersionHook`, the `CONFIG_FILE` constant + write, the
      `loadConfig`/`SCHEMA_VERSION` import, and `commit`/`commit-messages.md` from
      the `SKILLS`/`RULES` lists.
- [x] Remove the release init flags + prompts: `--changelog/--releases/
      --changelog-file/--releases-file/--product-name/--version-hook` and
      `resolveRelease` from `src/cli.js` (arg parsing, help text, `init` case,
      exports); `src/prompts.js` is now isolation-only.
- [x] Delete `src/config.js` (the `loadConfig` re-export) and drop its imports in
      `src/init.js`/`src/cli.js`. Confirmed `env/config.js` and `sync/config.js`
      (isolation + Linear loaders) are untouched.
- [x] Remove release wording from `assets/claude-md-section.md` (the "Also
      installed: /commit" paragraph). Left two soft `/commit` *suggestions* in
      spec-go/spec-complete — they don't claim skitterspec installs it; Phase 4
      docs can soften them.
- [x] Delete the release tests from skitterspec: `test/generate-releases.test.js`,
      `test/generate-changelog.test.js`, `test/git-commits.test.js`,
      `test/config.test.js`, and the release/flag-resolution cases in
      `test/init.test.js` — replaced with two strip-assertion tests.
- [x] Verified `skitterspec init` in a scratch dir installs only the 13 spec
      skills + `spec-planning.md` + `specs/` folders — no commit skill, no root
      config, no `scripts/`, no `version` hook.
- [x] Ran skitterspec's test command — `node --test` green (**165 tests**). No
      separate typecheck (plain CommonJS). Left this repo's own `package.json`
      release scripts + installed copies for Phase 4 (dogfood).

## Notes

- Do **not** touch this repo's own `package.json` release scripts or its installed
  `scripts/`/`.claude` copies here — that's Phase 4 (dogfooding). This phase is
  about what skitterspec *ships to others*.
