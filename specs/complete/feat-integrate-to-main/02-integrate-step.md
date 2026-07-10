# Phase 2 — Integrate planner + CLI + /spec-complete wiring ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A pure integrate planner behind a `spec-env integrate` CLI subcommand,
wired into `/spec-complete` as an opt-in rebase→ff→re-test step. End-to-end: a
completed isolated spec lands on base and its worktree/branch are reclaimed without
`--force`.

## Tasks

- [x] Add `src/env/integrate.js` — `planIntegrate(spec, config, ctx)` where
      `ctx = { worktreeState: { dirty }, base, aheadOfBase }`. Returns
      `{ blocked, reason, noop, commands, base, branch }`:
      - **blocked** when `dirty` — reason "commit the completion first" (no force
        override; the user commits).
      - **noop** when `!aheadOfBase` (already merged / nothing to land) — clean
        message, no commands.
      - else `commands = ['git -C <worktreePath> rebase <base>',
        'git -C <mainRepoPath> merge --ff-only <branch>']`.
      Pure — no git/`Date.now()`; `mainRepoPath`, `base`, `aheadOfBase` come in via
      `ctx`/`spec`.
- [x] Add the `spec-env integrate <spec>` CLI subcommand (`src/cli.js`): resolve
      the spec + base (`resolveBaseBranch`), query git for `dirty`/`aheadOfBase`
      and `mainRepoPath` (`dirname(abspath(git rev-parse --git-common-dir))`,
      Decision 7), call `planIntegrate`, and print the
      plan / block / no-op (mirror the `spec-env down` output shape). Add it to the
      `spec-env` help text.
- [x] Wire `/spec-complete` (`assets/skills/spec-complete/SKILL.md`) — new step
      between archive (4) and teardown offer (6), **only when
      `specs/.core/env.config.json` exists and the spec is on a worktree**:
      1. If the worktree is dirty (the completion edits aren't committed), offer
         `/commit` and stop the integrate — don't auto-commit.
      2. Run `spec-env integrate <spec>`; execute the printed commands in order.
         On a rebase non-zero exit, run `git -C <worktreePath> rebase --abort`,
         report the conflict, and stop (skip teardown).
      3. Re-run the project's test command against the base checkout; require green.
      4. Report the landing (base branch, linear ff), then continue to the teardown
         offer. Note it never pushes — mention the user can push base themselves.
      Keep the non-isolated path unchanged (no config → behaves exactly as today).
- [x] Update the teardown offer wording (step 7) to reflect that, post-integrate, a
      merged spec tears down without `--force` and the branch is deleted too.
- [x] Add a short README note (the isolation section) that `/spec-complete` can
      land the branch on base and reclaim the worktree/branch in one flow.
- [x] Add tests (`node --test`): `planIntegrate` emits the rebase+ff sequence for a
      diverged clean worktree, **blocks** on dirty, **no-ops** when not ahead, and
      targets the resolved base/branch. Run the project's test command — green
      before the phase is done (201 pass, 0 fail).

## Notes

Conflict handling stays in the skill (execute rebase; abort + hand back on
failure), keeping the planner pure — see Decisions 2 and 8. The ff step runs in
the **primary** checkout (`mainRepoPath`), not the worktree — resolve it once as
`dirname(abspath(git rev-parse --git-common-dir))` (Decision 7) and thread it
through `ctx`.

**Delivered / decisions (Phase 2):**

- **`spec-env integrate` resolves against the primary checkout, not cwd.**
  Discovered while smoke-testing: `/spec-complete` runs integrate from *inside* the
  worktree, but `resolveSpec` expands `{repo}` (and thus `worktreePath`) from the
  cwd basename — so from the worktree it mis-resolved. Fixed by computing
  `mainRepoPath` first (parent of `git rev-parse --git-common-dir`) and anchoring
  `resolveSpec` + `resolveBaseBranch` to it. Now robust from main *or* the worktree.
  (The other `spec-env` subcommands still assume they're run from the primary
  checkout — only `integrate` needed hardening, since it's the one the skill runs
  mid-worktree.)
- **New `/spec-complete` step 6 (Integrate), teardown renumbered to step 7.** The
  integrate step gates on isolation + a worktree, requires a clean tree (offers
  `/commit`, never auto-commits), executes rebase→ff, re-tests on base, and never
  pushes. Step 7 now advertises no-`--force` teardown + branch deletion.
- Smoke-tested end to end: help lists `integrate`; a dirty worktree correctly
  reports `blocked — commit the completion first`; resolution works from both the
  primary checkout and the worktree.
