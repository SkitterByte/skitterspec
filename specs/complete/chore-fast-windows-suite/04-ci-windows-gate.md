---
github_issue_id: "#260"
---

# Phase 4 — Stage only after Windows passes, in CI ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a tag push runs the Windows suite inside `release.yml`, and the stage
job runs only once it is green. Proven by `scripts/workflows.test.js`.

## Tasks

- [x] Add a `windows` job to `release.yml` matching `ci.yml`'s (long paths
      first, checkout, pnpm, Node 24 with no `registry-url`, install,
      `test:nested`, `test`), with its own `contents: read` permissions.
- [x] Give the `stage` job `needs: windows`, so a red Windows run stages
      nothing and there is nothing to approve.
- [x] Update `release.yml`'s header and RELEASING.md: a release stages only
      after Ubuntu and Windows are green, and takes about 10 minutes in CI.
- [x] Tests in `scripts/workflows.test.js`: the stage job needs the Windows
      job, the Windows job runs the same suite as `ci.yml`'s, and neither sets
      `registry-url`. Run `pnpm test`, green.

## Notes

- The Windows job is a copy of `ci.yml`'s, not a reusable workflow. A test
  holds the two `run:` lists equal, which keeps them in step without
  restructuring `ci.yml`.
- The job gets `contents: read` only, so the OIDC token the workflow requests
  stays with the stage job.
- The first tag pushed after this lands is the real proof. It should show the
  stage job waiting about 7–12 minutes for `windows (node 24)`.
