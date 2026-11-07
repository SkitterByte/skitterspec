---
github_issue_id: "#98"
---

# Phase 5 — Follow-up: branch handoff (push, mirror, resume) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

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

## Since written (2026-11-06)

- `feat-pr-landing` landed a consent-gated push (`integrate --push`,
  already-pushed-at-HEAD counts as consent) and `/spec-to-main` draft PRs. Under
  `land.strategy: "pr"` the branch is often already on the remote with a PR —
  reuse that push path for the handoff rather than a second one, and treat the
  PR as the native branch link where it exists.
- `feat-tracker-held-specs` (#123) changes `/spec-start` to materialise a spec
  from the tracker; `feat-rolling-base` (#113) adds a fetch to `spec-env up`.
  Both touch the fork path this phase changes — see the overview's Related specs.

## Tasks

- [x] `spec-env up`: detect `origin/<branch>` (`ls-remote`, positive signal) and
      provision tracking it. Print `resumed from origin/<branch> @ <sha>`.
- [x] `/spec-claim --to <someone else>`: dirty-tree refusal with the `/commit`
      offer, then a consented push, then the tracker write.
- [x] Add a branch/sha/phase field to the projection, plus a native link per
      provider where supported (text in the description otherwise).
- [x] Tests: resume from an existing remote branch; no remote → fork as today (a
      stays-silent test); a dirty handoff refuses; the push is never run without
      consent. Run `pnpm test` — green.

## Notes

- **Rebased onto `main` first.** `feat-rolling-base` had landed a fetch on the
  same `spec-env up` fork path, and the overview says whichever lands second
  builds on the other. The branch was unpublished and clean, and the only
  conflict was `reference.html`'s `verified:` line. 4445 tests were green after
  the rebase.
- **Resume is a positive `ls-remote` signal.** It is asked only where this clone
  has no such branch, no worktree for it, and the base remote exists. A remote
  that cannot be asked prints one `resume:` line and forks as before; a repo
  with no remote says nothing. A resumed branch outranks every fork point,
  a hotfix's tag included, and skips the spec-on-base gate, because the spec is
  on the branch. Worktree mode only: `checkout` mode has no fork to replace.
- **Decision 3 changed shape: a handoff comment, not a projected field.** The
  sync engine knows neither the git branch nor its sha, and a sha in the
  description would rewrite it on every commit. So the ticket carries the branch,
  sha and phases done as a **comment** posted at the hand-over
  (`spec-env handoff` writes it, `spec-sync comment` posts it). A comment is the
  surface no push replaces. Native branch links are not added. Under PR landing
  the PR is already the native link, and the others need integrations or a
  `{identifier}` branch pattern this repo does not assume.
- **A plain `push -u`, not `integrate --push`.** The PR-landing push also
  fetches, rebases and opens a PR, which a hand-over must not do.
  `already published at HEAD` is still read as needing no push.
