---
github_identifier: "#310"
github_url: "https://github.com/SkitterByte/skitterspec/issues/310"
---

# Park the Linear and Jira distributions

> **Type:** Chore
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/310
> **Name:** chore-park-linear-jira
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** scripts/parked.json (new), scripts/build-dist.js, scripts/release.js, scripts/release-notes.js, scripts/dev-link.js, scripts/dev-sync.js, scripts/dev-unlink.js, scripts/no-root-version.js, scripts/test-nested.js, package.json (test script), .github/workflows/release.yml, scripts/*.test.js, packages/common/test/*, packages/provider-kit/test/*, RELEASING.md, README.md, docs/linear.html, docs/jira.html, docs/index.html
> **Stack:** worktree
> **Docs:** linear, jira, index

## Summary

Stop building, testing and releasing `skitterspec-linear` and
`skitterspec-jira` for now, while keeping their source in the repo so the work
can carry on later. One list marks them as parked, and a single edit brings them back.

## Problem

Nobody is using the Linear or Jira distributions at the moment. Every build
still composes both, every release plan and tag workflow still carries them,
and the suite still runs their 979 tests along with every cross-distribution
asset test. That costs time on every build and every release.

## Acceptance criteria

- `pnpm build` composes only `skitterspec`, `skitterspec-github` and
  `skitterspec-azure-boards`
- `node scripts/release.js skitterspec-linear patch` refuses and names the
  package as parked
- `release.yml` has no `skitterspec-linear@*` or `skitterspec-jira@*` trigger
  and no dispatch option for either
- `pnpm test`, `pnpm test:nested` and CI (ubuntu and windows) run no test
  under `packages/linear/` or `packages/jira/` and stay green
- `node --test packages/linear/test/` still runs those tests by hand
- Un-parking is the parked list plus the `release.yml` triggers, and both are
  written down in RELEASING.md

## Decisions

1. **One parked list, not deletion.** A small JSON file (`scripts/parked.json`)
   names the parked distributions and their source packages. Every script that
   lists distributions reads it and filters. Deleting the entries everywhere was
   rejected because bringing them back would mean rebuilding all of it.
2. **Source stays.** `packages/linear`, `packages/jira` and the
   `packages/skitterspec-{linear,jira}` shells stay where they are, untouched,
   along with the root `workspace:*` devDeps, so the source keeps resolving
   and its tests can still be run by hand.
3. **Tests are skipped too.** `pnpm test` stops discovering `packages/linear`
   and `packages/jira`. Bare `node --test` cannot exclude, so the script runs a
   small runner that lists the test files minus the parked sources. Keeping the
   tests (3.4s) was weighed and turned down: "leave off checking" means checking too.
4. **The workflow is edited by hand.** YAML cannot read the JSON, so the parked
   tags and dispatch options are removed from `release.yml`, and
   `scripts/workflows.test.js` asserts that no parked distribution appears there.
5. **npm is left as it is.** `skitterspec-linear@20.2.3` and
   `skitterspec-jira@3.2.3` stay installable, with no deprecation. Nothing new is
   published.
6. **Cross-distribution tests follow the list.** A test that loops over
   distributions reads the filtered set. A test that names linear or jira
   directly is skipped with a reason when that distribution is parked, never
   deleted.

## Solution overview

- `scripts/parked.json` holds `{ "dists": ["skitterspec-linear", "skitterspec-jira"], "sources": ["packages/linear", "packages/jira"] }`.
  A tiny helper reads it.
- `build-dist.js` `DISTS`, `release.js` `PACKAGES`, `release-notes.js`
  `PACKAGES`, and the dev-link/sync/unlink `DISTS` all leave out parked entries.
  `release.js` on a parked name refuses with "parked — see scripts/parked.json".
- `package.json` `test` runs `node scripts/run-tests.js`, which hands
  `node --test` every `*.test.js` outside the parked sources and passes through
  its arguments (the windows job's reporters). `test-nested.js` skips the parked
  sources as well.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config | add | scripts/parked.json |
| CLI command | update | `pnpm build`: drops linear, jira |
| CLI command | update | `release.js`, `approve`: refuse a parked package |
| CLI command | update | `pnpm test`: runs via scripts/run-tests.js |
| CI workflow | update | release.yml: drop linear/jira tags, options, case guard |
| Docs | update | RELEASING.md, README, docs/linear, jira, index: mark as parked |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Parked list drives build, release and the release workflow | ✅ | [01-park-build-release.md](01-park-build-release.md) |
| 2 | Tests skip parked sources; docs say parked | ⬜ | [02-park-tests-docs.md](02-park-tests-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-24 — Spec created.
- 2026-11-24 — Phase 1: release notes hold a commit that feeds only a parked
  distribution (`shipsIn`) rather than reporting it as an orphan, so parking
  adds no warning to every base release. `dev-link` defaults to
  `skitterspec-github` while linear is parked. `ALL_DISTS` / `ALL_PACKAGES` /
  `ALL_TARBALL_INPUTS` stay exported for the build-output scan, the
  migration-guide check and the historical-tag guard test.
