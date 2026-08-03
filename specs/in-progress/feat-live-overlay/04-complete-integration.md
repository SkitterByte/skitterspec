# Phase 4 — Live-aware completion (`integrate` / `/spec-complete`) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Completing a spec that's currently live merges via fast-forward (the
`take` rebase already lined it up) and tears the live session down — no second
merge path. Proven by extending the existing integrate tests for the live case.

## Tasks

- [ ] Make `integrate` live-aware in `env/teardown.js` + `cli.js`
      (`specEnvIntegrate`): detect the live state (primary checkout already on the
      spec's branch **and** a receipt present). In that case the plan is: commit any
      outstanding work on the branch → `git -C <primary> checkout <base>` →
      fast-forward base to the branch → clear the receipt → remove the worktree.
- [ ] Preserve the non-live path unchanged (worktree branch → rebase + fast-forward
      as today). Detect which path via the guard + receipt, not a flag.
- [ ] If the fast-forward isn't clean (base moved since `take`), fall back to the
      existing rebase-then-ff guidance rather than forcing.
- [ ] Update the `/spec-complete` skill (`assets/skills/spec-complete/SKILL.md`) to
      call the live-aware `integrate` and note the "spec is live" branch of the flow
      (commit → ff → clear receipt → remove worktree).
- [ ] Add tests: extend `env-integrate.test.js` / `cli-spec-env-integrate.test.js`
      with a live-state fixture (primary on branch + receipt) asserting the
      commit→checkout base→ff→clear→remove plan, and confirm the non-live path is
      untouched. `pnpm test` green.

## Notes

Because `take` rebases base into the branch up front, the common completion is a
fast-forward — that's the whole reason there's no separate `live complete` verb.
Clearing the receipt is what returns the guard to "free".
