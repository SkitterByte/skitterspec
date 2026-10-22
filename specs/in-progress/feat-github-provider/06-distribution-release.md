---
linear_issue_id: "SKS-414"
github_issue_id: "#7"
---

# Phase 6 — Distribution + release wiring ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `@skitterbyte/skitterspec-github` composes, links for dev, and is
releasable as the fourth tag series; every three-package list carries four.

## Tasks

- [x] `build-dist.js`: `DISTS` entry + `VENDOR` row via `buildProvider`;
      `.gitignore` the dist's built dirs.
- [x] `packages/skitterspec-github/package.json`: bins `skitterspec-github` +
      `skitterspec`, build hooks, README, one-of-four OR rule in the
      description.
- [x] Common: `ENGINE_BINS`, `PROTECTED_CONFIG` (`github.config.json`),
      `PROTECTED_DIRS` (`github-base`), `cli.js` provider diagnostic,
      `main-guard.cjs` + `review-gate.cjs` engine loops.
- [x] `release.js` `PACKAGES` + `TARBALL_INPUTS`; `release-notes.js` `PACKAGES`
      + `FEEDS`; `release.yml` fourth tag prefix, dispatch choice and case arm;
      `workflows.test.js`.
- [x] Dev tooling arrays (`dev-link`/`dev-sync`/`dev-unlink`),
      `skill-budget.test.js`, `package-metadata.test.js`, `RELEASING.md`,
      `MIGRATION.md` heading for 1.0.0.
- [x] Test: compose the dist, no seam markers survive, both bins resolve,
      `guardNoWorkspaceRequires` passes. Full workspace suite green.

## Notes

Out of repo, before phase 7's release: configure the npm trusted publisher for
`@skitterbyte/skitterspec-github`.

## Notes (built)

- Every three-distribution list now carries four: `build-dist.js` (`VENDOR`
  row + `DISTS` entry on `buildProvider`), `release.js` (`PACKAGES`,
  `TARBALL_INPUTS`), `release-notes.js` (`PACKAGES`, `FEEDS` — github feeds
  only its own dist; common/sync-core/kit feed it too), `release.yml` (tag
  prefix, dispatch choice, case arm), the dev-link/sync/unlink arrays, common's
  `ENGINE_BINS` / `PROTECTED_CONFIG` / `PROTECTED_DIRS`, both hook engine loops,
  the `cli.js` provider diagnostic, and their tests.
- `packages/skitterspec-github` at `0.0.0` (release.js cuts 1.0.0), bins
  `skitterspec-github` + `skitterspec`, README, and a `MIGRATION.md` section
  that doubles as the move-trackers guide (open specs re-push, finished keep
  their old stamps, old `Refs: SKS-N` count as historical).
- The dev-link "unknown distribution" example was `skitterspec-github` itself
  and moved — exactly as it did for jira.
- Smoke: `init` from the composed dist installs 20 skills (incl.
  `spec-github-setup`, `spec-claim`), the github core docs, and no seam marker.
- The root `package.json` devDependency on the provider landed in phase 3
  (the bin needed it); the npm trusted publisher is still the operator's.
