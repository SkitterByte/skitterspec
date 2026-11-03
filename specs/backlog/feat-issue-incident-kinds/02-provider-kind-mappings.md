---
github_issue_id: "#87"
---

# Phase 2 — Provider kind mappings ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every provider accepts `issue` and `incident` in its kind maps and
reads the kind off the folder prefix, so `workItemTypeByKind.issue = "Issue"`
mints an Issue.

## Tasks

- [ ] Azure: add the kinds to `specKindOf`
      (`packages/azure-boards/src/cli-sync.js:152`) and the slug-strip regex
      (`cli-sync.js:464`); widen the kind allowlist in
      `packages/azure-boards/src/config.js:206` (`workItemTypeByKind`)
- [ ] GitHub: widen the kind allowlist (`packages/github/src/config.js:198`,
      `labelsByKind`) and its kind-off-prefix reader
- [ ] Jira: widen `packages/jira/src/config.js:153` (`issueTypeByKind`) and
      its kind reader
- [ ] Linear: widen `packages/linear/src/config.js:332` (`labelsByKind`) and
      its kind reader
- [ ] sync-core: check the projected body shape for the new kinds — issue and
      incident specs render the feature-shaped body (overview sections);
      only bug/hotfix keep the bug-shaped render. Add a test pinning that
- [ ] Mint-type validation: a `workItemTypeByKind.issue` / `.incident` entry's
      type joins the pre-write type set exactly as `chore` does today
      (extend the existing tests)
- [ ] Tests per provider: an `issue-`/`incident-` spec mints the mapped type /
      labels; an unmapped kind falls back to the configured default exactly as
      today (stays-silent)
- [ ] Run `pnpm -r test` + typecheck — green
