---
github_issue_id: "#184"
---

# Phase 2 — Git, spec attribution and open items ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** each repo group carries the author's commits, lifecycle events,
ticket and open state per spec, proven against temp repos.

## Tasks

- [x] Add `tada/commits.js` — `git log --all --since --author <user.email>
      --name-status -M`, deduped by sha (Decision 6)
- [x] Map branch → spec through the project's `branch.pattern`; attribute
      base-branch commits by `Refs:` trailer or touched spec folder, else
      `no spec`
- [x] Detect lifecycle events from renames/adds under `specs/<bucket>/` and
      phase headings flipping to ✅ (Decision 5)
- [x] Read the ticket from spec frontmatter or `Refs:` (Decision 8)
- [x] Attach open state from the `skitterspec status` reader
      (`inflight.js`): progress, waiting pass, armed gate (Decision 9)
- [x] Group non-skitterspec repos by branch
- [x] Tests: temp repo with a spec branch, a base-branch commit with a
      `Refs:` trailer, a backlog→in-progress move, a phase ticked, a commit by
      another author (excluded), a repo with no skitterspec; run
      `pnpm typecheck` and `pnpm test` — green
