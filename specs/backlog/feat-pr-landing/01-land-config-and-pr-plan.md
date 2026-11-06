---
github_issue_id: "#107"
---

# Phase 1 — `land` config + PR integrate planner behind consent ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine can plan a PR-mode land — fetch, rebase onto
`origin/<base>`, consent-gated push, PR create — as pure, unit-tested planner
output; nothing executes it yet.

## Tasks

- [ ] Add `land: { strategy: 'ff', remote: 'origin', draft: true, specDocs: 'trunk' }`
      to `DEFAULT_CONFIG` and `defaults()` in `packages/common/src/env/config.js`,
      with validation (`strategy` ∈ ff|pr, `specDocs` ∈ trunk|branch) and the
      doc-block entry; unknown-key collection must accept the new subtree.
- [ ] Add `planIntegratePr(spec, config, ctx)` to
      `packages/common/src/env/integrate.js`: commands are
      `git fetch <remote> <base>`, `git -C <worktree> rebase <remote>/<base>`,
      then a push step shaped like `planHotfixLand`'s —
      `{ kind: 'push', via: 'remote' | 'push' | 'hold' }` (already-pushed-at-HEAD
      honoured as the positive signal; `--push` from the CLI; otherwise hold and
      print `git push --force-with-lease -u <remote> <branch>` plus the PR-create
      command). Blocked on a dirty tree, same reason text as the ff planner.
- [ ] `afterLand` in a PR plan is deferred, not emitted: the plan carries
      `afterLand: noAfterLand()` and a `pending: 'after-merge'` marker, since
      base has not moved (completion run 2 owns it).
- [ ] Wire `spec-env integrate` in `cli.js` to pick the planner from
      `land.strategy` (worktree and checkout modes), accept `--push`, and print
      the PR plan with the hold/consent wording hotfix uses. The no-op message
      distinguishes "already landed on <base>" from "PR open — not yet merged"
      (needs phase 2's adapter; until then print the hold form).
- [ ] Unit tests for the new planner: ff default untouched (existing tests stay
      green), pr plan shape per via, dirty block, deferred afterLand — plus a
      stays-silent test: a trunk project with no `land` key gets byte-identical
      plans to today (`negative-checks.md` rule 3).
- [ ] Run `pnpm test` and the typecheck/build (`pnpm run build`) — green before
      the phase is done.

## Notes

The planner stays pure: the CLI supplies `pushedAtHead`, `remote`, `base` from
git, exactly as it supplies `dirty`/`aheadOfBase` today. PR-create command
composition lives here only as a printed string; detection of az vs gh is
phase 2's adapter, so until phase 2 lands the command is composed for the
configured remote's URL with a generic fallback (`<open a PR for %branch>`).
