# Phase 1 — Config + normalize/validate CLI (the seam) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A provider-agnostic config + normalization layer with a starter
Shortcut profile, fully unit-tested — the seam every tracker plugs into. No skill
or MCP work yet.

## Tasks

- [ ] Document the `skitterspec.config.json` schema and the **normalized issue**
      shape (see Solution overview) in `README.md` under a new "Trackers" section.
- [ ] Add `src/config.js` (CommonJS, zero-dep): `loadConfig(dir)` reads
      `skitterspec.config.json`; `resolveActiveProfile(config)` returns the
      profile named by `tracker`; `validateConfig(config)` returns a `string[]` of
      clear errors (unknown active `tracker`, missing `tools.fetch`, empty `map`
      title/body, empty `status`, etc.).
- [ ] Add `src/normalize.js`: `normalizeIssue(raw, profile)` — pure function
      applying `profile.map` (support simple dotted + `[].field` array paths),
      resolving `type` from `profile.routing` vs the issue's labels, and
      collecting comments. Returns the normalized shape; never throws on missing
      optional fields (emits `null`/`[]`).
- [ ] Extend `src/cli.js`: add an `issue normalize` subcommand (reads raw JSON
      from **stdin**, prints normalized JSON) and a `config check` subcommand
      (runs `validateConfig`, prints errors, exits non-zero on failure).
- [ ] Update `src/init.js`: write a starter `skitterspec.config.json` (Shortcut
      profile, `triageTag: "ready-for-spec"`) **only if absent** (idempotent);
      after writing/refreshing, run `validateConfig` and surface any errors in the
      report. Do not clobber an existing config.
- [ ] Add tests (`node --test`): `test/config.test.js` (validate happy + each
      error path; load + resolve active profile) and `test/normalize.test.js`
      (field map incl. nested/array paths, routing → bug/feature/null,
      missing-field tolerance). Extend `test/init.test.js` to assert the starter
      config is written and is idempotent on re-run.
- [ ] Run `npm test` — all green before the phase is done.

## Notes

Keep everything zero-dependency: Node 18+ has `JSON`, `process.stdin`, and global
`fetch` (not needed here — MCP does the fetching in Phase 2). The CLI's
`issue normalize` exists so the markdown skill applies the field map
deterministically via a tested code path rather than improvising it.
