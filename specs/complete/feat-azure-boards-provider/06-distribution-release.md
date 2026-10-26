---
linear_issue_id: "SKS-423"
github_issue_id: "#15"
---

# Phase 6 — Distribution + release wiring ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `@skitterbyte/skitterspec-azure-boards` builds, versions and releases
exactly like the other supersets — proven by a dry-run release and the dist
build in CI.

## Tasks

- [x] `scripts/build-dist.js`: compose the `skitterspec-azure-boards` dist;
      bin `skitterspec-azure-boards` + `skitterspec` alias (Decision 14);
      dist README.
- [x] `packages/common` init: `ENGINE_BINS`, `PROTECTED_*`, hook engine loops
      learn the fifth engine bin.
- [x] `scripts/release.js` + `release-notes.js`: the fifth tag series
      (`skitterspec-azure-boards@`); `.github/workflows/release.yml` stages it
      by OIDC like the others.
- [x] `scripts/dev-link/sync/unlink`: the new package joins the dev loop.
- [x] Install exclusivity: docs and init say install exactly one of the five
      distributions.
- [x] Tests green: dist build output, init's protected lists, release-notes
      series walk. Full workspace suite (`pnpm test`); `node
      scripts/release.js --dry-run` for the new series.

## Notes

- Wired as the FIFTH distribution, mirroring the github wiring commit
  (`202de44a`): workflow tags/choices/case, both hooks' engine-bin loops,
  `ENGINE_BINS`/`PROTECTED_CONFIG`/`PROTECTED_DIRS`, build-dist VENDOR + DISTS,
  dev-link/sync/unlink, no-root-version, release.js PACKAGES +
  TARBALL_INPUTS, release-notes PACKAGES + FEEDS, README/RELEASING rows,
  .gitignore dist outputs, and a MIGRATION.md section (foreignPatterns called
  out for a tracker move).
- Dist starts at 0.0.0; the first release (phase 7) bumps it.
- `npm run approve` needed no change — it reads the release.js registry.
