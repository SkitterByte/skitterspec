# Phase 2 — `live take` + `/spec-live` (take/status) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env live take <spec>` brings a code-only spec live on the running
instance via branch-switch, guarded and refusing stateful specs. Ship the
`/spec-live <spec>` skill (take + status). Proven by planner tests over the happy
path and every refusal.

## Tasks

- [ ] Add `planTake(spec, config, gitState)` to `env/live.js` — pure; given the
      resolved spec, config, and probed git/health state, return the ordered
      command plan + the receipt to write, or a structured refusal. Preconditions:
      primary on base (guard), primary clean, spec resolves to a branch + worktree.
- [ ] Enforce the v1 stateful refusal: refuse if the spec's `Stack` is
      `worktree + docker` (reuse `readStackField`), and — when `env.config`
      declares a `migrations.glob` — if `git diff base...branch --name-only` hits
      it. Refusal message points at `/spec-connect`.
- [ ] Emit the take plan: `git -C <worktree> rebase <base>` (on conflict: abort
      and tell the user to resolve in the worktree, leave state untouched) →
      `git -C <worktree> switch --detach` → `git -C <primary> checkout <branch>` →
      write receipt (`baseMainCommit` = primary HEAD before switch, `holder`,
      `heldSince` passed in — no `Date.now()` in planners).
- [ ] Verify-only dev process: before switching, poll health on the canonical
      ports (reuse `dev.js` / `supervise.js` health helpers); refuse if nothing is
      listening ("start your dev server / `spec-env dev up` first"). After switch,
      if `git diff --name-only` includes the lockfile/manifest, print a
      **warn**: "dependencies changed — restart your dev server". No auto-restart.
- [ ] Implement `specEnvLive` `take` in `cli.js` (execute/print the plan per the
      seam pattern; write the receipt).
- [ ] Create the skill `packages/common/assets/skills/spec-live/SKILL.md` —
      `/spec-live <spec>` runs `skitterspec spec-env live take <spec>` and the
      printed commands; document the guard, the stateful refusal, and the
      restart warning. Include `status` usage.
- [ ] Add tests: extend `env-live.test.js` for `planTake` (happy path + each
      refusal: not-on-base, dirty, docker spec, migration-touching diff, no server)
      and `cli-spec-env-live.test.js` for the `take` wiring. `pnpm test` green.

## Notes

`heldSince` and any timestamps must be injected by `cli.js`, not generated in the
planner (`Date.now()` is unavailable in the pure layer per repo conventions).
Rebase target is the resolved base branch (`baseBranch` or auto-detected), matching
`integrate`.
