# Phase 1 — Engine safety net: `integrate` abort + `up` live-guard ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env integrate` never finalizes a spec having landed nothing —
it aborts loudly when commits would be stranded — and `spec-env up` no-ops
cleanly when the spec is live. Proven by unit tests over the CLI/planners.

## Tasks

- [ ] In `specEnvIntegrate` (`packages/common/src/cli.js`, live-aware block
      ~L550–610), **reorder so detection precedes the destructive
      `git checkout base` in the primary** — never leave the primary off-branch
      having landed nothing.
- [ ] Add a work-loss guard to the live path: if the worktree is **missing**, or
      exists but is on a **detached HEAD with commits ahead of the branch ref**,
      **abort** with a diagnostic (worktree path, stranded sha, `git -C <path>
      branch <tmp> <sha>` recovery hint). Do not proceed to finalize/teardown.
- [ ] Replace the silent "already landed — nothing to integrate" / "has no
      worktree" returns in the live path (`cli.js:582–610`) with the abort above
      when commits would be stranded; keep a genuine no-op **only** when the
      branch is truly at base with nothing stranded.
- [ ] Only finalize once `<branch>` is confirmed ahead of base and fast-forwards
      (reuse existing `aheadOfBase` check, now gated behind the guard).
- [ ] Make `spec-env up` live-safe: `specEnvUp`/`planUp`
      (`packages/common/src/env/provision.js`) consult `assertPrimaryOnMain`
      (`resolve.js:205`); when the spec's branch holds the primary checkout,
      print "spec is live — work in the primary checkout (or `/spec-live main`
      first)" and no-op instead of emitting a failing `git worktree add`.
- [ ] Add tests under `packages/common` covering: (a) integrate aborts on
      stranded detached-HEAD commits; (b) integrate aborts when primary is
      off-base and the worktree is missing; (c) integrate lands cleanly when
      commits are on the branch in the primary; (d) `up` no-ops when live. Run
      `npm test` (`node --test`) — green before the phase is done.

## Notes

Authority for "live" is git state via `assertPrimaryOnMain`, not the advisory
`.spec-env/live.json` receipt — guards must key off git, not the receipt.
