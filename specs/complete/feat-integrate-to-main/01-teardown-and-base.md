# Phase 1 — Base resolution + teardown (branch delete, merged-safe guard) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A shared base-branch resolver, plus a teardown planner that deletes the
merged branch and stops blocking a fully-merged worktree — all pure and
unit-tested. No integrate step yet.

## Tasks

- [x] Add `resolveBaseBranch(config, gitQuery)` to `src/env/resolve.js` —
      precedence `config.baseBranch ?? origin/HEAD ?? 'main' (if exists) ??
      'master' (if exists)`. `gitQuery` is an injected reader (symbolic-ref /
      show-ref) so the function stays pure and testable; the CLI supplies the live
      one. Export it.
- [x] Add optional `baseBranch` to the env config: `src/env/config.js`
      `mergeConfig` (`assign(base, parsed, 'baseBranch', 'string')`), document it
      in `assets/core/env.config.md`, and add it (blank) to
      `assets/core/env.config.json.example`.
- [x] Extend `planDown` (`src/env/teardown.js`): accept `ctx.worktreeState.merged`
      (bool). Change the unpushed guard to block only when `unpushed && !merged`.
      Append `git branch -d <branch>` to `commands` after `git worktree remove`
      (use the resolved branch from `spec`; `-d`, never `-D`). Keep the dirty guard
      unchanged.
- [x] Extend `worktreeGitState` (`src/cli.js`): compute `merged` via
      `git merge-base --is-ancestor HEAD <base>` (base from `resolveBaseBranch`);
      pass it through in the `spec-env down` ctx. Ensure a missing worktree still
      returns a safe `{ dirty:false, unpushed:false, merged:true }` (nothing to
      lose).
- [x] Update `assets/skills/spec-env-down/SKILL.md`: document that a branch merged
      into base tears down without `--force`, and that the plan now includes
      `git branch -d` (relay a branch-delete failure — e.g. unexpectedly unmerged —
      rather than forcing `-D`).
- [x] Add tests (`node --test`): `resolveBaseBranch` precedence (each fallback +
      override); `planDown` deletes the branch, passes the guard when `merged`,
      still blocks when `unpushed && !merged`, and uses `-d` not `-D`. Run the
      project's test command — green before the phase is done (197 pass, 0 fail).

## Notes

Branch name lives on the resolved `spec` (from `resolve.js` branch derivation) —
reuse it; don't re-derive in the planner. The `merged` check runs in the worktree
(`git -C <wt> merge-base --is-ancestor HEAD <base>`) — worktrees share the object
store, so `<base>` is visible there.

**Delivered / decisions (Phase 1):**

- **`baseBranch` merged as `'string'`** (not `'string?'`) — an empty value means
  "auto-detect", so a blank string must *not* override the default; `'string'`
  (non-empty-to-override) is the correct type. Default `''`.
- **Shared `gitReader(cwd)` helper** added to `src/cli.js` — returns trimmed
  stdout or `null` on non-zero exit; used for both base resolution and the
  `merge-base --is-ancestor` merged check (and reusable by Phase 2's integrate).
- **Branch delete is always `-d`, even under `--force`** (Decision 3). A forced
  teardown of an *unmerged* branch removes the worktree but the `git branch -d`
  fails loudly; the skill relays it rather than escalating to `-D`.
- **Guard message**: "unpushed commits not yet merged into the base branch" — the
  planner stays base-name-agnostic (it consumes the `merged` bool; the CLI knows
  the base).
