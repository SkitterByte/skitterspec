---
linear_issue_id: "SKS-406"
---

# Phase 5 — `hotfix finish` and the end-to-end test ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** teardown happens only once the release is tagged and published, and the whole
flow is proven in a temp repo.

## Tasks

- [x] Add `spec-env hotfix finish [spec]`. Its guards are:
  - a clean tree;
  - a release tag at HEAD (`reachableFromTag`, including `-hotfix.N`);
  - the branch on the remote.
  - Each failing guard is named. Then it runs worktree remove and `branch -D`, and
    forgets the record. There is no `--force` and no merged-into-main guard.
- [x] `finish` is the only teardown `/spec-complete` uses for a hotfix. `spec-env down`
  is left as it is, an explicit operator verb whose guards already treat a tagged HEAD as
  landed. Add a test pinning that `down` is unchanged.
- [x] Integration test in a temp repo with a bare remote. A stub `releaseWith`
  version-commits, tags and prints skittership-shaped JSON. Assert that:
  - the tag is pushed after the branch;
  - main gains the fix and the spec-doc commits, and not the version commit;
  - `finish` refuses until the branch is on the remote, then tears down.
- [x] Test that the default `branch.pattern` gives a hotfix spec `hotfix/<slug>`
  (skittership's `branchPrefix`).
- [x] Run `pnpm test`; green before the phase is done.
