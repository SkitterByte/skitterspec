'use strict'

/**
 * Pure integrate planner for `spec-env integrate`.
 *
 * `planIntegrate` decides whether a spec's worktree branch can be landed onto the
 * base branch and, if so, emits the exact commands the `/spec-complete` skill runs
 * (rebase the branch onto base in the worktree, then fast-forward base to it in the
 * primary checkout). It performs no side effects: the caller (the CLI) queries git
 * for `dirty`/`aheadOfBase`/`mainRepoPath` and supplies them, keeping this
 * deterministic and unit-testable with no live git.
 *
 * Strategy is rebase + fast-forward (linear history). Conflict handling lives in
 * the skill: it runs the rebase and, on a non-zero exit, `git rebase --abort` and
 * hands back — so the planner never needs to reason about conflicts.
 *
 * @param {object} spec  resolved spec: { branch, worktreePath, folder, ... }
 * @param {object} config normalised env config (unused today; kept for symmetry).
 * @param {object} ctx   { worktreeState: { dirty }, base, aheadOfBase, mainRepoPath }
 * @returns {object} { blocked, noop, reason, commands, base, branch }
 */
function planIntegrate(spec, config, ctx) {
  const { worktreeState = {}, base, aheadOfBase, mainRepoPath } = ctx || {}
  const branch = spec.branch
  const result = { blocked: false, noop: false, reason: null, commands: [], base, branch }

  // The completion edits must be committed first — never rebase a dirty tree.
  if (worktreeState.dirty) {
    return { ...result, blocked: true, reason: 'worktree has uncommitted changes — commit the completion first' }
  }

  // Nothing on the branch that isn't already on base → already landed.
  if (!aheadOfBase) {
    return { ...result, noop: true }
  }

  return {
    ...result,
    commands: [
      `git -C ${spec.worktreePath} rebase ${base}`,
      `git -C ${mainRepoPath} merge --ff-only ${branch}`,
    ],
  }
}

module.exports = { planIntegrate }
