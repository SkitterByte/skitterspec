---
github_issue_id: "#257"
---

# Phase 2 — One test pass per release batch ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `release.js a,b,c minor --yes` runs each gate once, then commits and
tags every package. Proven by `scripts/release.test.js`.

## Tasks

- [x] Parse a comma-separated package list. Plan each bump, refusing the
      whole batch up front if any one package refuses (nothing to ship, a
      taken tag, a dirty tree).
- [x] Write every version and release-notes file, then run the native, Linux
      and Windows gates once over that tree.
- [x] On green, commit and tag each package in turn, base first. On red,
      leave every bump unstaged and print the one restore command covering
      all of them.
- [x] Print the push commands as `git push`, then one
      `git push origin <tag>` per tag. More than three tags in one push
      creates no GitHub events, so CI never fires.
- [x] Update RELEASING.md's flow for batches.
- [x] Tests: batch plan order, one gate run per batch, all-or-nothing
      refusal, the single-package path unchanged. Run `pnpm test`, green.

## Notes

- The suite steps moved into a shared `verifySteps`, so a single-package plan
  is unchanged and a batch reuses them once. `buildBatchPlan` splits each
  member's steps at its stage (version and notes before the suites, add,
  commit and tag after).
- One package is not a batch: `release.js skitterspec minor` plans exactly as
  before, and `parseArgs` gains a `pkgs` list beside `pkg`.
