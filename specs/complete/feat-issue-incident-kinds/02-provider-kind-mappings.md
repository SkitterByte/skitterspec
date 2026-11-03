---
github_issue_id: "#87"
---

# Phase 2 — Provider kind mappings ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every provider accepts `issue` and `incident` in its kind maps and
reads the kind off the folder prefix, so `workItemTypeByKind.issue = "Issue"`
mints an Issue.

## Tasks

- [x] Azure: add the kinds to `specKindOf`
      (`packages/azure-boards/src/cli-sync.js:152`) and the slug-strip regex
      (`cli-sync.js:466`); widen the kind allowlist in
      `packages/azure-boards/src/config.js:206` (`workItemTypeByKind`)
- [x] GitHub: widen the kind allowlist (`packages/github/src/config.js:198`,
      `labelsByKind`) and its kind-off-prefix reader
- [x] Jira: widen `packages/jira/src/config.js:153` (`issueTypeByKind`) and
      its kind reader
- [x] Linear: widen `packages/linear/src/config.js:332` (`labelsByKind`) and
      its kind reader
- [x] sync-core: check the projected body shape for the new kinds — issue and
      incident specs render the feature-shaped body (overview sections);
      only bug/hotfix keep the bug-shaped render. Test added pinning that
- [x] Mint-type validation: a `workItemTypeByKind.issue` / `.incident` entry's
      type joins the pre-write type set — no code needed (`unionStates` reads
      `Object.values(workItemTypeByKind)` generically); the per-type rework
      lands in phase 3
- [x] Tests per provider: an `issue-`/`incident-` spec mints the mapped type /
      labels (one test each in azure, github, jira, linear); the unmapped
      fallback stays covered by the existing chore stays-silent tests, which
      exercise the same lookup
- [x] Run `pnpm -r test` + typecheck — green (packages 0 failures, root 4,204
      pass; no typecheck script in this repo)
