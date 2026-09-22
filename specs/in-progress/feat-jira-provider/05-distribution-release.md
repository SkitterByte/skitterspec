---
linear_issue_id: "SKS-375"
---

# Phase 5 — Distribution + release wiring ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `@skitterbyte/skitterspec-jira` composes, links for dev, and is
releasable as the third tag series; every hardcoded two-package list in the
repo now carries three.

## Tasks

- [ ] `build-dist.js`: refactor `buildLinear` into `buildProvider(providerDir,
      distName)` (:169-207 is already generic in shape); add the
      `skitterspec-jira` `DISTS` entry and the jira `VENDOR` row; extend
      `.gitignore` with the dist's three built dirs.
- [ ] `packages/skitterspec-jira/package.json`: bin aliases
      `skitterspec-jira` + `skitterspec`, prepare/prepack build hooks,
      README, description carrying the install-one-of-three OR rule.
- [ ] Common updates: `init.js:128` `ENGINE_BINS` += `skitterspec-jira`;
      `init.js:916-917` `PROTECTED_CONFIG` += `jira.config.json`,
      `PROTECTED_DIRS` += `jira-base`/`jira-backups`; `cli.js:177-180`
      `PROVIDER_COMMANDS` diagnostic reworded to name both superset dists;
      `main-guard.cjs:88` + `review-gate.cjs:85` engine loops += the new bin.
- [ ] Release wiring: `release.js` `PACKAGES` + `TARBALL_INPUTS`
      (`common, jira, sync-core, provider-kit, skitterspec-jira` paths — and
      add `provider-kit` to the two existing entries' inputs);
      `release-notes.js` `PACKAGES` + `FEEDS` (common→all three,
      sync-core/provider-kit→both supersets, jira→jira — miss this and every
      jira release reports "no user-facing change").
- [ ] `.github/workflows/release.yml`: third literal tag prefix
      `skitterspec-jira@*`, third `workflow_dispatch` choice, third `case` arm;
      `scripts/workflows.test.js` third assertion.
- [ ] Dev tooling: `dev-link.js`/`dev-sync.js`/`dev-unlink.js` arrays,
      `skill-budget.test.js` `SKILL_TREES` += `packages/jira/assets/skills`,
      `no-root-version.js` help text, `package-metadata.test.js` third dist
      path, `RELEASING.md` packages table + tag-series prose.
- [ ] `MIGRATION.md`: `## @skitterbyte/skitterspec-jira` section for the 1.0.0
      cut (the migration-guide test demands a heading per major).
- [ ] Test: compose the jira dist and assert no seam markers survive, both bins
      resolve, and `guardNoWorkspaceRequires` passes; run the full workspace
      suite.

## Notes

npm-side (out of repo, do before phase 6's release): configure the trusted
publisher for `@skitterbyte/skitterspec-jira` on the npm registry — CI is the only
publisher, per RELEASING.md.
