---
github_issue_id: "#173"
---

# Phase 3 — Backlog checks read spec branches ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `gating check`, `epic status` and `docs-freshness check` see a spec
that exists only on a spec branch — proven by tests over a fixture repo.

## Tasks

- [x] Add `packages/common/src/env/specbranches.js`: list local and
      remote-tracking branches matching `branch.pattern`, take the spec
      folders each one's range (`base...ref`) changed, read them off it with
      `git show`, return `{ folder, bucket, ref, local, overview, phases }`;
      never fetch
- [x] Apply the precedence rule (base `complete/`/`cancelled/` › local branch ›
      remote-tracking › base `backlog/`) in one shared helper
- [x] Merge it into `gating.js`, `epicread.js` and `scripts/docs-freshness.js`;
      label branch-sourced rows with their ref and "as of last fetch"
- [x] Name the blind spots beside the reader: unfetched remotes, a branch not
      matching the pattern
- [x] Tests: branch-only spec reported by all three; base-complete beats a stale
      branch; no spec branches / no git / landed branch → nothing (stays-silent);
      local beats remote-tracking; `pnpm test` (4867) and `test:nested` (167)
      — green

## Notes

`epic status` keeps "a wait is met only on the base branch" — a branch copy can
make a member visible, never make a wait met.
