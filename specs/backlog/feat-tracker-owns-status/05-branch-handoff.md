---
github_issue_id: "#98"
---

# Phase 5 — Follow-up: branch handoff (push, mirror, resume) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** when a ticket changes owner, the new owner can find the current code
and carry on from it, not just read it.

## Decisions (agreed 2026-11-03, before this phase was written)

1. **A branch name on a ticket is worthless unless the branch is pushed.** Spec
   branches live in local worktrees today and may never reach `origin`.
2. **Handoff pushes, after asking.** `/spec-claim` handing a spec to someone else
   pushes the branch (it's outward-facing, so it asks first). It refuses on a
   dirty tree and offers `/commit` (`satisfy`), because uncommitted work in the
   old worktree can't be handed over.
3. **The ticket carries branch, last-pushed sha and phase reached**, as a field
   the repo owns (one-way). Use the native link where the provider has one:
   GitHub linked branches, Linear branch linking, Jira's dev panel, Azure
   artifact links.
4. **`/spec-start` resumes rather than forks.** If `origin/<branch>` exists,
   `spec-env up` builds the worktree from it instead of forking from base.
   Cannot-tell (fetch fails) prints the fact and forks as today.

## Tasks

- [ ] `spec-env up`: detect `origin/<branch>` (`ls-remote`, positive signal) and
      provision tracking it. Print `resumed from origin/<branch> @ <sha>`.
- [ ] `/spec-claim --to <someone else>`: dirty-tree refusal with the `/commit`
      offer, then a consented push, then the tracker write.
- [ ] Add a branch/sha/phase field to the projection, plus a native link per
      provider where supported (text in the description otherwise).
- [ ] Tests: resume from an existing remote branch; no remote → fork as today (a
      stays-silent test); a dirty handoff refuses; the push is never run without
      consent. Run `pnpm test` — green.
