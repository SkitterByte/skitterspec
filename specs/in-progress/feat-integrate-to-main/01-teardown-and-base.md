# Phase 1 — Base resolution + teardown (branch delete, merged-safe guard) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A shared base-branch resolver, plus a teardown planner that deletes the
merged branch and stops blocking a fully-merged worktree — all pure and
unit-tested. No integrate step yet.

## Tasks

- [ ] Add `resolveBaseBranch(config, gitQuery)` to `src/env/resolve.js` —
      precedence `config.baseBranch ?? origin/HEAD ?? 'main' (if exists) ??
      'master' (if exists)`. `gitQuery` is an injected reader (symbolic-ref /
      show-ref) so the function stays pure and testable; the CLI supplies the live
      one. Export it.
- [ ] Add optional `baseBranch` to the env config: `src/env/config.js`
      `mergeConfig` (`assign(base, parsed, 'baseBranch', 'string?')`), document it
      in `assets/core/env.config.md`, and add it (commented/blank) to
      `assets/core/env.config.json.example`.
- [ ] Extend `planDown` (`src/env/teardown.js`): accept `ctx.worktreeState.merged`
      (bool). Change the unpushed guard to block only when `unpushed && !merged`.
      Append `git branch -d <branch>` to `commands` after `git worktree remove`
      (use the resolved branch from `spec`; `-d`, never `-D`). Keep the dirty guard
      unchanged.
- [ ] Extend `worktreeGitState` (`src/cli.js`): compute `merged` via
      `git merge-base --is-ancestor HEAD <base>` (base from `resolveBaseBranch`);
      pass it through in the `spec-env down` ctx. Ensure a missing worktree still
      returns a safe `{ dirty:false, unpushed:false, merged:true }` (nothing to
      lose).
- [ ] Update `assets/skills/spec-env-down/SKILL.md`: document that a branch merged
      into base tears down without `--force`, and that the plan now includes
      `git branch -d` (relay a branch-delete failure — e.g. unexpectedly unmerged —
      rather than forcing `-D`).
- [ ] Add tests (`node --test`): `resolveBaseBranch` precedence (each fallback +
      override); `planDown` deletes the branch, passes the guard when `merged`,
      still blocks when `unpushed && !merged`, and uses `-d` not `-D`. Run the
      project's test command — green before the phase is done.

## Notes

Branch name lives on the resolved `spec` (from `resolve.js` branch derivation) —
reuse it; don't re-derive in the planner. The `merged` check runs in the worktree
(`git -C <wt> merge-base --is-ancestor HEAD <base>`) — worktrees share the object
store, so `<base>` is visible there.
