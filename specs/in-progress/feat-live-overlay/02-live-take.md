# Phase 2 — `live take` + `/spec-live` (take/status) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env live take <spec>` brings a code-only spec live on the running
instance via branch-switch, guarded and refusing stateful specs. Ship the
`/spec-live <spec>` skill (take + status). Proven by planner tests over the happy
path and every refusal.

## Tasks

- [x] Add `planTake(spec, config, ctx)` to `env/live.js` — pure; given the
      resolved spec and probed git/health state, returns the ordered command plan +
      the receipt to write, or a structured refusal. Preconditions: primary on base
      (guard), primary clean, spec resolves to a branch + worktree.
- [x] Enforce the v1 stateful refusal: refuse if the spec's `Stack` is
      `worktree + docker` (`spec.stack === 'docker'`), and — when `env.config`
      declares `live.migrations` globs — if `git diff base...branch --name-only`
      hits them (`globToRegExp`/`migrationsHit`, dependency-free). Both point at
      `/spec-connect`. Added the `live.migrations` field to `env/config.js`.
- [x] Emit the take plan: `git -C <worktree> rebase <base>` (CLI aborts the rebase
      and bails on conflict, state untouched) → `git -C <worktree> switch --detach`
      → `git -C <primary> checkout <branch>` → write receipt (`baseMainCommit` =
      primary HEAD before switch; `holder`/`heldSince` injected by the CLI, no
      `Date.now()` in the planner).
- [x] Verify-only dev process: probe the declared canonical (`frontPort`) ports
      with `portsInUse`; refuse if declared-but-not-listening. None declared →
      `serverUp = null`, switch proceeds with a warning. If `git diff` touches a
      lockfile/manifest, **warn** "restart your dev server". No auto-restart.
- [x] Implement `specEnvLive` `take` in `cli.js` (async; probes git/ports, calls
      `planTake`, executes the switch with a `runGit` helper, writes the receipt).
- [x] Create `packages/common/assets/skills/spec-live/SKILL.md` — `/spec-live
      <spec>` takes, `status` shows who's live; documents the guard, the stateful
      refusal, the conflict/restart cases. Kept project-agnostic (no `pnpm`).
- [x] Add tests: `env-live.test.js` (`planTake` happy + not-on-base/dirty/no-
      worktree/docker/migrations/no-server refusals + warnings; glob matching),
      `cli-spec-env-live.test.js` (live-git `take` end-to-end + second-take
      refusal), `env-config.test.js` (`live.migrations` parse). `pnpm test` green —
      358 pass, 0 fail.

## Notes

`heldSince` and any timestamps must be injected by `cli.js`, not generated in the
planner (`Date.now()` is unavailable in the pure layer per repo conventions).
Rebase target is the resolved base branch (`baseBranch` or auto-detected), matching
`integrate`.
