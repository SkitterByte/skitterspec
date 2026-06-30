# Phase 3 — Interactive install CLI ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `init` guides the user through enabling changelog/release tooling,
writes `skitterspec.config.json`, copies the right script assets, and wires the
version hook — interactively on a TTY, via flags/defaults otherwise.

## Tasks

- [ ] Add `prompts` (terkelg) to `package.json` `dependencies`. Note in the PR
      this is the first runtime dependency (deliberate, per Decision 4).
- [ ] Extend `src/cli.js` arg parsing with the new flags: `--changelog` /
      `--no-changelog`, `--releases` / `--no-releases`, `--changelog-file=NAME`,
      `--releases-file=NAME`, `--product-name=NAME`, `--version-hook` /
      `--no-version-hook`, and `--yes` (accept defaults, skip prompts). Keep the
      existing `--force`, `--no-claude-md`, target-dir, and `update` behaviour.
- [ ] Add `src/prompts.js` (or inline in cli) — the guided flow using `prompts`:
      (1) enable changelog? → filename; (2) enable release notes? → filename +
      product name; (3) if a `package.json` exists, wire the version hook?
      Pre-fill defaults from an existing `skitterspec.config.json` (re-run) or
      `DEFAULT_CONFIG`. Honour `prompts` cancel (Ctrl-C) → abort cleanly.
- [ ] Gate interactivity: prompt only when `process.stdin.isTTY` and `--yes`
      not set; otherwise resolve every value from flags then defaults. Never
      block in CI.
- [ ] In `src/init.js`: write/merge `skitterspec.config.json` (don't clobber a
      user's edited config without `--force`; merge new keys in on `update`).
- [ ] Conditionally copy script assets: when `changelog.enabled` →
      `scripts/generate-changelog.js` + `scripts/lib/git-commits.js` (+
      `scripts/lib/config.js`); when `releases.enabled` →
      `scripts/generate-releases.js` (+ shared lib). Share the lib copy so it
      isn't duplicated. Respect existing-file / `--force` rules like skills.
- [ ] Version-hook wiring (opt-in, only if `package.json` exists): idempotently
      add npm scripts — `version` (runs the enabled generators + `git add` the
      output files), `changelog`/`releases`, and `changelog:retro`/`releases:retro`.
      If a custom `version` script already exists, **do not overwrite** without
      `--force`; print a warning telling the user what to add manually.
- [ ] Update the report output + `--help` text to cover the new flags and what
      was installed/skipped.
- [ ] Tests: extend `test/init.test.js` — config written with chosen
      values; scripts copied only for enabled features; lib copied once; version
      hook added when opted in + `package.json` present; existing custom
      `version` script preserved without `--force`; `update` re-syncs scripts
      without clobbering config; non-TTY/`--yes` path uses defaults without
      prompting.
- [ ] Run `node --test` — green before the phase is done.

## Notes

`init` tests run non-interactively, so the flag/`--yes` path must fully drive a
setup without `prompts`. Keep `prompts` confined to the TTY branch so the test
suite never imports/exercises the interactive UI. Mock/stub `package.json`
presence per-temp-project as the existing tests already create temp dirs.
