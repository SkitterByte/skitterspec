---
github_identifier: "#303"
github_url: "https://github.com/SkitterByte/skitterspec/issues/303"
---

# Bug: Jira `spec-sync ref` crashes with no spec named

> **Type:** Bug
> **Name:** bug-jira-ref-current-branch
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/303
> **Area:** packages/jira (src/cli-sync.js)
> **Docs:** none: restores the documented behaviour, nothing a page describes changes

## Symptom

Found while fixing bug-base-forwards-provider-verbs. On a Jira project, the
bare form that the `Refs:` trailer uses crashes instead of answering from the
branch:

```
$ skitterspec-jira spec-sync ref
skitterspec-jira: git is not a function
```

It exits 1 on every branch, so every Jira user's commits lose the `Refs:`
trailer. `ref <spec>` works.

## Root cause

`specSyncRef` (`packages/jira/src/cli-sync.js:774`) calls `currentBranch(dir)`
with a path, but `currentBranch` (`packages/common/src/env/resolve.js:616`)
takes a git reader bound to the checkout. GitHub's provider already builds
that reader (`packages/github/src/cli-sync.js:1074`); Jira never got it.

## Failing test (red)

`packages/jira/test/cli-sync.test.js`, run with
`node --test packages/jira/test/cli-sync.test.js`:

- `ref with no spec answers from the branch`: on `feat/demo`, prints
  `PROJ-7`, exit 0
- `ref with no spec on a branch no spec matches says so`: on `main`,
  `ref: no spec matches branch main`, exit 1

```
✖ ref with no spec answers from the branch
  TypeError [Error]: git is not a function
```

## Fix

- [x] Pass `currentBranch` a git reader bound to `dir`, as GitHub's provider does
- [x] Failing tests pass (GREEN); `pnpm test` shows no regressions
- [x] None

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `skitterspec-jira spec-sync ref` with no spec answers from the branch |

## Changelog

- 2026-11-24 — Bug reproduced; failing tests added (red).
- 2026-11-24 — Fixed: Jira's `ref` builds a git reader for `currentBranch`;
  tests green.
- 2026-11-24 — Completed; fix done, tests green.
