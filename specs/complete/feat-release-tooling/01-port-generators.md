# Phase 1 — Port lib + generators to zero-dep JS ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The three provided TS files run as plain CommonJS under Node 18+ with
no `tsx`/`vitest`/`pnpm`, with project-specific values injected rather than
hardcoded, proven by ported `node:test` suites.

## Tasks

- [x] Create `assets/scripts/lib/git-commits.js` — port `git-commits.ts`
      verbatim in behaviour: `parseCommit`, `reconstructCommits`,
      `getCommitsSinceLastTag`, `getCommitsBetween`, `getAllVersionTags`,
      `getTagDate`, `escapeRegex` as CommonJS `module.exports`. Drop the TS
      types; keep the `execSync` git plumbing, NUL-delimited parsing, breaking-
      change detection, and CI shallow-clone fallbacks unchanged.
- [x] Create `assets/scripts/generate-changelog.js` — port `generate-changelog.ts`.
      Replace hardcoded constants with **injected config**: changelog filename
      and (later) any options come from a config object passed in; keep the
      `--retro <count>` path, `upsertSection` logic, and category mapping. The
      CLI entrypoint resolves config in Phase 2; for now accept defaults.
- [x] Create `assets/scripts/generate-releases.js` — port `generate-releases.ts`.
      Make `SCOPE_AREAS`, the `productName`/header text, and the output filename
      **parameters** (sourced from config in Phase 2) instead of module
      constants; default `scopeAreas` to `{}` (Title-Case fallback) and product
      name to the repo dir name. Preserve `bucketFor`, `resolveArea`,
      `parseReleaseNote`, `formatReleaseDate`, `renderReleasesSection`,
      `upsertReleasesSection`, highlights, and `--retro`.
- [x] Keep the pure functions exported (as the TS versions are) so tests can
      import them without running the IO/CLI path (used `require.main === module`
      — the CommonJS equivalent of the `process.argv[1]` guard).
- [x] Port `generate-releases.test.ts` → `test/generate-releases.test.js` using
      `node:test` + `node:assert` (translate the `vitest` `describe/it/expect`).
      Cover the same cases: `bucketFor`, `resolveArea`, `parseReleaseNote`
      (single/multi-line/highlight/area-override/breaking/none), `formatReleaseDate`,
      `renderReleasesSection`, `upsertReleasesSection`.
- [x] Add `test/git-commits.test.js` — focused tests for `parseCommit`
      (conventional parse, scope, `!` breaking, `BREAKING CHANGE:` footer,
      non-conventional → null) and `reconstructCommits` (NUL grouping, empty
      bodies, trailing delimiter).
- [x] Add a small `test/generate-changelog.test.js` for `categorizeCommits` +
      `upsertSection` (insert, idempotent re-run, replace-in-place).
- [x] Run `node --test` — green before the phase is done (38 pass, 0 fail).

## Notes

Source of truth for behaviour is the three user-provided files (in the spec
discussion) — port, don't redesign. The only intentional behavioural change is
de-hardcoding project-specific values; everything else must match. Genericising
to *parameters* now (config wiring lands in Phase 2) keeps the functions pure
and unit-testable without a config file on disk.

**As-built notes (for Phase 2 wiring):**

- `resolveArea(scope, override, scopeAreas = {})` and
  `parseReleaseNote(commit, scopeAreas = {})` take the scope→area map as a
  trailing arg (was a module constant). Default `{}` → Title-Case fallback.
- The FF-CSC `DEFAULT_HEADER` became `defaultReleasesHeader(productName,
  changelogFile)`; product name defaults to `path.basename(process.cwd())`.
- The IO entrypoints take an options bag, ready for the config loader:
  `updateChangelog(version, { file })`, `retroFillChangelog(count, { file })`,
  `updateReleases(version, { file, productName, scopeAreas, changelogFile })`,
  `retroFillReleases(count, { …same })`.
- CLI guard is `require.main === module` (CommonJS form of the `argv[1]` check).
- `generate-releases.test.js` passes an explicit `AREAS` map to exercise the
  mapping, since the shipped default map is now empty.
