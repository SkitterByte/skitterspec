# Phase 2 — Strip release tooling out of skitterspec ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A skitterspec install is spec-only — no commit skill, no rule, no
generators, no release config or flags — with all release code and tests removed
and the remaining suite green.

## Tasks

- [ ] Delete the moved assets from skitterspec: `assets/skills/commit/`,
      `assets/rules/commit-messages.md`, `assets/scripts/generate-changelog.js`,
      `assets/scripts/generate-releases.js`, `assets/scripts/lib/git-commits.js`,
      `assets/scripts/lib/config.js` (remove now-empty dirs).
- [ ] Remove the release config from `src/init.js`: the `changelog`/`releases`/
      `versionHook` handling, `releaseFromConfig`/`releaseFromFlags`, the
      `CONFIG_FILE = 'skitterspec.config.json'` write, the version-hook wiring, and
      the corresponding release entries from the asset copy lists.
- [ ] Remove the release init flags + prompts: `--changelog/--releases/
      --changelog-file/--releases-file/--product-name/--version-hook` from
      `src/cli.js` arg parsing and help text, and the changelog/releases/version-hook
      questions from the interactive `init` prompt flow.
- [ ] Delete `src/config.js` (the `loadConfig` re-export) and drop its imports in
      `src/init.js`/`src/cli.js`. Confirm `env/config.js` and `sync/config.js`
      (isolation + Linear loaders) are untouched.
- [ ] Remove release wording from `assets/claude-md-section.md` and any
      skitterspec skill/rule text that describes commit/release tooling as part of
      skitterspec (leave the pointer-to-skittership work to Phase 4 docs).
- [ ] Delete the release tests from skitterspec: `test/generate-releases.test.js`,
      `test/generate-changelog.test.js`, `test/git-commits.test.js`,
      `test/config.test.js`, and the release cases in `test/init.test.js` (keep the
      spec-folder/skill/rule install cases).
- [ ] Verify `skitterspec init` in a scratch dir installs only spec skills +
      rules + `specs/` folders, writes no root config, and adds no `version` hook.
- [ ] Run skitterspec's typecheck + test commands — green before the phase is done.

## Notes

- Do **not** touch this repo's own `package.json` release scripts or its installed
  `scripts/`/`.claude` copies here — that's Phase 4 (dogfooding). This phase is
  about what skitterspec *ships to others*.
