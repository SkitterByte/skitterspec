# Phase 1 — Engine safety net: `integrate` abort + `up` live-guard ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env integrate` never finalizes a spec having landed nothing —
it aborts loudly when commits would be stranded — and `spec-env up` no-ops
cleanly when the spec is live. Proven by unit tests over the CLI/planners.

## Tasks

- [x] In `specEnvIntegrate` (`packages/common/src/cli.js`, live-aware block),
      **reorder so detection precedes the destructive `git checkout base` in the
      primary** — never leave the primary off-branch having landed nothing.
- [x] Add a work-loss guard to the live path: if the worktree is **missing**, or
      exists but is on a **detached HEAD with commits ahead of the branch ref**,
      **abort** with a diagnostic (worktree path, stranded sha, `git -C <path>
      branch <tmp> <sha>` recovery hint). Do not proceed to finalize/teardown.
- [x] Replace the silent "already landed — nothing to integrate" / "has no
      worktree" returns in the live path with the abort above when commits would
      be stranded; a genuine no-op survives **only** when the branch is truly at
      base with nothing stranded (the guard catches stranding before re-isolation,
      so the fall-through no-op is now reachable only for real no-work cases).
- [x] Only finalize once `<branch>` is confirmed ahead of base and fast-forwards
      (existing `aheadOfBase` check retained, now gated behind the guard).
- [x] Make `spec-env up` live-safe: `specEnvUp` consults `assertPrimaryOnMain`
      (`resolve.js`); when the spec's branch holds the primary checkout, print
      "is live in the primary checkout — work there (or `/spec-live main` first)"
      and no-op instead of emitting a failing `git worktree add`.
- [x] Add tests under `packages/common` covering: (a) integrate aborts on
      stranded detached-HEAD commits; (b) integrate aborts when primary is
      off-base and the worktree is missing; (c) integrate lands cleanly when
      commits are on the branch in the primary; (d) `up` no-ops when live. Ran
      `npm test` (`node --test`) — 423 pass, 0 fail.

## Notes

Authority for "live" is git state via `assertPrimaryOnMain`, not the advisory
`.spec-env/live.json` receipt — guards key off git, not the receipt.

The guard lives entirely in the CLI (`specEnvIntegrate`), matching the existing
live-aware code: it needs git IO (detached-HEAD detection, stranded-commit
count), so `planIntegrate` stays a pure planner and is unchanged. Tests are the
real-git CLI integration suites (`cli-spec-env-integrate.test.js`,
`cli-spec-env-up.test.js`), which drive `live take → integrate` end-to-end.
