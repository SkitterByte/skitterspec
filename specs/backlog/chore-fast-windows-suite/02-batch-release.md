---
github_issue_id: "#257"
---

# Phase 2 — One test pass per release batch ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `release.js a,b,c minor --yes` runs each gate once, then commits and
tags every package. Proven by `scripts/release.test.js`.

## Tasks

- [ ] Parse a comma-separated package list. Plan each bump, refusing the
      whole batch up front if any one package refuses (nothing to ship, a
      taken tag, a dirty tree).
- [ ] Write every version and release-notes file, then run the native, Linux
      and Windows gates once over that tree.
- [ ] On green, commit and tag each package in turn, base first. On red,
      leave every bump unstaged and print the one restore command covering
      all of them.
- [ ] Print the push commands as `git push`, then one
      `git push origin <tag>` per tag. More than three tags in one push
      creates no GitHub events, so CI never fires.
- [ ] Update RELEASING.md's flow for batches.
- [ ] Tests: batch plan order, one gate run per batch, all-or-nothing
      refusal, the single-package path unchanged. Run `pnpm test`, green.
