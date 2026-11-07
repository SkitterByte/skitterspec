---
github_issue_id: "#115"
---

# Phase 2 — `spec-env base`: fetch and list ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** one command shows which rc skitterspec will use and which in-flight
specs are behind it — proven by CLI tests over a fixture remote.

## Tasks

- [x] Add `spec-env base [--json]`: `git fetch <remote> --prune`, then list the
      pattern matches newest-first with commit dates, marking the resolved one
      (`← base`) and a pin when `baseBranch` overrides the pattern
- [x] List each provisioned spec whose fork point is on an older match
      (`feat-x · forked from 2026/Q4`)
- [x] With no pattern configured, print the resolved base and how it was found
      (pin / origin/HEAD / fallback), and nothing else
- [x] A failed fetch says so and lists from the refs already present — exit 0
- [x] Tests: listing order, resolved marker, pin marker, stale-spec rows, no
      pattern, fetch failure; run `pnpm test` — green before done

## Notes

Lists only. Pinning is a hand edit of `baseBranch` (Decision 5).
