---
github_issue_id: "#120"
---

# Phase 2 — Land onto the release branch ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `hotfix land` puts the fix on the release branch by ff or PR, behind
the existing consent gate, with an optional tag — proven by plan tests.

## Tasks

- [x] Branch-based `hotfix land` plan: rebase onto `<remote>/<releaseBranch>`,
      then the `land.strategy` step (`ff`: push to the release branch; `pr`: push
      the hotfix branch and open a **ready** PR) — reuse the `integrate` PR
      planner and `--push` consent; honour `--strategy`
- [x] `hotfix.tag: true` → cut the tag on the release-branch head after the land
      is confirmed (under `pr`, on the run that sees it merged); `false` → no tag
- [x] Record the land in the hotfix state so a re-run is idempotent, as the tag
      release is today
- [x] Tests: ff plan, pr plan (ready, not draft), held without consent, tag on
      and off, re-run no-op; run `pnpm test` — green before done
