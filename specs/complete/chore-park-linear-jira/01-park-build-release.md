---
github_issue_id: "#311"
---

# Phase 1 — Parked list drives build, release and the release workflow ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Linear and Jira are no longer built, planned, released or triggered
from a tag. This is proven by the build/release/workflow tests.

## Tasks

- [x] Add `scripts/parked.json` and a helper (`scripts/parked.js`) that reads
      it, with `isParkedDist` and `isParkedSource`
- [x] Filter parked entries out of `build-dist.js` `DISTS`, `release.js`
      `PACKAGES`/`TARBALL_INPUTS`, `release-notes.js` `PACKAGES`/prefix map,
      and the `DISTS` in `dev-link.js`, `dev-sync.js`, `dev-unlink.js`
- [x] Make `release.js` and `approve-release.cjs` refuse a parked name with a
      message naming `scripts/parked.json`, not the generic "unknown package"
- [x] Update `no-root-version.js`'s package list from the same source
- [x] Remove the linear/jira tag triggers, dispatch options and case-guard
      arms from `.github/workflows/release.yml`
- [x] Update the tests that enumerate distributions (`build-dist`, `release`,
      `release-notes`, `dev-link`, `dev-sync`, `workflows`,
      `package-metadata`, `approve-release`, `migration-guide`,
      `windows-gate`, `claude-links`, `global-install`, `skill-budget`,
      `docs-claims`): loops read the filtered set, and named linear/jira cases
      skip with a reason
- [x] Assert in `workflows.test.js` that no parked distribution appears in
      `release.yml`. Add a stays-silent test that an empty parked list
      restores all five (`.claude/rules/negative-checks.md`)
- [x] `pnpm build && pnpm test`: green before the phase is done

## Notes

Leave the `packages/skitterspec-{linear,jira}` shells and their gitignored
build output alone. Removing a stale `assets/` folder is not this spec's job.
