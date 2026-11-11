---
github_issue_id: "#173"
---

# Phase 3 — Backlog checks read spec branches ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `gating check`, `epic status` and `docs-freshness check` see a spec
that exists only on a spec branch — proven by tests over a fixture repo.

## Tasks

- [ ] Add `packages/common/src/env/specbranches.js`: list local and
      remote-tracking branches matching `branch.pattern`, read
      `specs/<bucket>/<folder>/00-overview.md` off each with `git cat-file`,
      return `{ folder, bucket, ref, overview }`; never fetch
- [ ] Apply the precedence rule (base `complete/`/`cancelled/` › local branch ›
      remote-tracking › base `backlog/`) in one shared helper
- [ ] Merge it into `gating.js`, `epicread.js` and `scripts/docs-freshness.js`;
      label branch-sourced rows with their ref and "as of last fetch"
- [ ] Name the blind spots beside the reader: unfetched remotes, a branch not
      matching the pattern
- [ ] Tests: branch-only spec reported by all three; base-complete beats a stale
      branch; trunk repo with no spec branches → output identical to today
      (stays-silent); no remote → local branches only; run the typecheck and
      test commands — green

## Notes

`epic status` keeps "a wait is met only on the base branch" — a branch copy can
make a member visible, never make a wait met.
