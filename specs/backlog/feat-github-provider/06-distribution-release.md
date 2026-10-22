---
linear_issue_id: "SKS-414"
---

# Phase 6 — Distribution + release wiring ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `@skitterbyte/skitterspec-github` composes, links for dev, and is
releasable as the fourth tag series; every three-package list carries four.

## Tasks

- [ ] `build-dist.js`: `DISTS` entry + `VENDOR` row via `buildProvider`;
      `.gitignore` the dist's built dirs.
- [ ] `packages/skitterspec-github/package.json`: bins `skitterspec-github` +
      `skitterspec`, build hooks, README, one-of-four OR rule in the
      description.
- [ ] Common: `ENGINE_BINS`, `PROTECTED_CONFIG` (`github.config.json`),
      `PROTECTED_DIRS` (`github-base`), `cli.js` provider diagnostic,
      `main-guard.cjs` + `review-gate.cjs` engine loops.
- [ ] `release.js` `PACKAGES` + `TARBALL_INPUTS`; `release-notes.js` `PACKAGES`
      + `FEEDS`; `release.yml` fourth tag prefix, dispatch choice and case arm;
      `workflows.test.js`.
- [ ] Dev tooling arrays (`dev-link`/`dev-sync`/`dev-unlink`),
      `skill-budget.test.js`, `package-metadata.test.js`, `RELEASING.md`,
      `MIGRATION.md` heading for 1.0.0.
- [ ] Test: compose the dist, no seam markers survive, both bins resolve,
      `guardNoWorkspaceRequires` passes. Full workspace suite green.

## Notes

Out of repo, before phase 7's release: configure the npm trusted publisher for
`@skitterbyte/skitterspec-github`.
