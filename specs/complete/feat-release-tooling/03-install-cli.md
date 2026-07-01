# Phase 3 — Interactive install CLI ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `init` guides the user through enabling changelog/release tooling,
writes `skitterspec.config.json`, copies the right script assets, and wires the
version hook — interactively on a TTY, via flags/defaults otherwise.

## Tasks

- [x] Add `prompts` (terkelg) to `package.json` `dependencies` (`^2.4.2`) — the
      first runtime dependency (deliberate, per Decision 4). Installed locally.
- [x] Extend `src/cli.js` arg parsing with the new flags: `--changelog` /
      `--no-changelog`, `--releases` / `--no-releases`, `--changelog-file=NAME`,
      `--releases-file=NAME`, `--product-name=NAME`, `--version-hook` /
      `--no-version-hook`, and `--yes`/`-y`. Existing `--force`, `--no-claude-md`,
      target-dir, and `update` behaviour kept.
- [x] Add `src/prompts.js` — the guided flow using `prompts`: (1) enable
      changelog? → filename; (2) enable release notes? → filename + product name;
      (3) if a `package.json` exists, wire the version hook? Pre-fills from the
      seed (existing config merged with flags). `prompts` cancel → throws
      `Setup cancelled`, caught by the bin (exit 1).
- [x] Gate interactivity: prompt only when `process.stdin.isTTY` and `--yes`
      not set; otherwise resolve every value from flags then defaults
      (`resolveRelease`). `prompts` is lazily `require`d inside the TTY branch
      only — never loaded in CI / tests.
- [x] In `src/init.js`: write `skitterspec.config.json`. The written object is
      the seed (existing file + flags/answers), so it's a merge not a clobber —
      persisted without `--force`; identical content is skipped. `update` leaves
      config untouched.
- [x] Conditionally copy script assets: `changelog.enabled` →
      `scripts/generate-changelog.js`; `releases.enabled` →
      `scripts/generate-releases.js`; the shared `scripts/lib/git-commits.js` +
      `scripts/lib/config.js` copied once when either is enabled. Respects
      existing-file / `--force` rules via the shared `writeFile`.
- [x] Version-hook wiring (opt-in, only if `package.json` exists): idempotently
      adds `version` (enabled generators + `git add` the output files),
      `changelog`/`releases`, and `changelog:retro`/`releases:retro`. A custom
      `version` script is **not** overwritten without `--force` — a warning
      prints the line to add manually.
- [x] Updated the report output (warnings section) + `--help` text for the new
      flags.
- [x] Tests: extended `test/init.test.js` — config written with chosen values;
      scripts copied only for enabled features (+ shared lib); none when both
      disabled; version hook added when opted in + `package.json` present;
      custom `version` preserved without `--force` and overwritten with it;
      `update` re-syncs scripts without clobbering config; `resolveRelease`
      flag/default resolution (the non-TTY path).
- [x] Run `node --test` — green (57 pass, 0 fail). Also smoke-tested the real
      `bin` end-to-end and `npm pack --dry-run` (tarball clean, no `node_modules`).

## Notes

`init` tests run non-interactively, so the flag/`--yes` path must fully drive a
setup without `prompts`. Keep `prompts` confined to the TTY branch so the test
suite never imports/exercises the interactive UI. Mock/stub `package.json`
presence per-temp-project as the existing tests already create temp dirs.

**As-built deviations from the task wording:**

- **Config persistence:** the task said "don't clobber a user's edited config
  without `--force`". Because the CLI always seeds the written config from the
  on-disk file (via `loadConfig`) before applying flags/answers, writing is a
  *merge* — edits like a hand-tuned `scopeAreas` survive — so `writeConfig`
  persists without a `--force` gate and only skips when content is identical.
  This is strictly safer than a blind overwrite while still letting an explicit
  re-run change settings.
- **"Merge new keys on `update`":** deferred — schema is v1 and stable, and the
  loader already tolerates missing keys, so `update` simply leaves the config
  file alone (it re-syncs *scripts*, the actual upgrade need).
- **Helper scripts vs. custom `version`:** when a custom `version` script is
  preserved, the `changelog`/`releases`(`:retro`) helpers are still added — they
  don't conflict, and the warning tells the user the `version` line to add.
