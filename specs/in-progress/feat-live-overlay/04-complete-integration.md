# Phase 4 — Live-aware completion (`integrate` / `/spec-complete`) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Completing a spec that's currently live merges via fast-forward (the
`take` rebase already lined it up) and tears the live session down — no second
merge path. Proven by extending the existing integrate tests for the live case.

## Tasks

- [x] Make `integrate` live-aware in `cli.js` (`specEnvIntegrate`): detect the live
      state (primary checkout on the spec's branch). **Design:** rather than fork
      the plan, it ends the live session first — `checkout <base>` → re-attach the
      branch to its worktree → clear the receipt — which returns to the exact normal
      state, so the existing rebase→ff plan and teardown then run unchanged.
- [x] Preserve the non-live path unchanged. Detection is by the guard (primary
      on/off base + which branch), not a flag; `planIntegrate` is untouched.
- [x] Fast-forward-after-base-moved is handled *for free* — the release routes into
      the normal path, whose `git -C <worktree> rebase <base>` replays the branch
      before the ff. Refuses if a *different* spec holds the primary checkout.
- [x] Update `/spec-complete` (`assets/skills/spec-complete/SKILL.md`) step 6 —
      note that `integrate` is live-aware: it ends the live session (release) then
      lands normally; refuses on a dirty primary or a foreign live spec; teardown
      (step 7) unchanged.
- [x] Add tests: `cli-spec-env-integrate.test.js` — a live-state case (take → the
      integrate ends the session, prints the normal rebase+ff plan, primary back on
      base, branch re-isolated, receipt cleared) and a foreign-live-spec refusal;
      the two existing non-live anchor tests still pass unchanged. `pnpm test` green
      — 373 pass, 0 fail.

## Notes

Because `take` rebases base into the branch up front, the common completion is a
fast-forward — that's the whole reason there's no separate `live complete` verb.
Clearing the receipt is what returns the guard to "free".
