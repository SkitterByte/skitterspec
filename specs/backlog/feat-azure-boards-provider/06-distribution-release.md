---
linear_issue_id: "SKS-423"
github_issue_id: "#15"
---

# Phase 6 — Distribution + release wiring ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `@skitterbyte/skitterspec-azure-boards` builds, versions and releases
exactly like the other supersets — proven by a dry-run release and the dist
build in CI.

## Tasks

- [ ] `scripts/build-dist.js`: compose the `skitterspec-azure-boards` dist;
      bin `skitterspec-azure-boards` + `skitterspec` alias (Decision 14);
      dist README.
- [ ] `packages/common` init: `ENGINE_BINS`, `PROTECTED_*`, hook engine loops
      learn the fifth engine bin.
- [ ] `scripts/release.js` + `release-notes.js`: the fifth tag series
      (`skitterspec-azure-boards@`); `.github/workflows/release.yml` stages it
      by OIDC like the others.
- [ ] `scripts/dev-link/sync/unlink`: the new package joins the dev loop.
- [ ] Install exclusivity: docs and init say install exactly one of the five
      distributions.
- [ ] Tests green: dist build output, init's protected lists, release-notes
      series walk. Full workspace suite (`pnpm test`); `node
      scripts/release.js --dry-run` for the new series.
