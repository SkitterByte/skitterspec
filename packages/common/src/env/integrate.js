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
 * In CHECKOUT mode there is no worktree: the branch is already checked out in the
 * primary checkout, so landing is a rebase in place, a switch to base, and the
 * fast-forward. `planIntegrateCheckout` below covers that; the shape of what it
 * returns is identical so callers need no second code path.
 *
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

/**
 * Pure integrate planner for CHECKOUT mode.
 *
 * The branch lives in the primary checkout, so `git -C <worktree> rebase` — the
 * worktree-mode plan — has nothing to address. Landing is three steps in one
 * repo: rebase onto base, switch to base, fast-forward.
 *
 * The switch is what makes this safe to repeat. Leaving the checkout on the spec
 * branch after landing would mean the next `spec-env up` refuses ("standing on
 * another spec's branch") for a spec that is finished, and the operator would
 * have to know to switch back by hand.
 *
 * ctx: { dirty, base, aheadOfBase, checkoutPath, onBranch }
 */
function planIntegrateCheckout(spec, config, ctx) {
  const { dirty, base, aheadOfBase, checkoutPath, onBranch } = ctx || {}
  const branch = spec.branch
  const result = { blocked: false, noop: false, reason: null, commands: [], base, branch }

  // "Already landed" is answered FIRST, before any refusal. A landed spec needs
  // no action wherever the checkout happens to be standing — and after a
  // successful land it is standing on base, so asking "not on the branch" here
  // would refuse the very spec this just finished landing. /spec-complete calls
  // integrate again on exactly that state.
  if (!aheadOfBase) {
    return { ...result, noop: true }
  }
  if (dirty) {
    return {
      ...result,
      blocked: true,
      reason: 'the checkout has uncommitted changes — commit the completion first',
    }
  }
  // There IS something to land, so where you are standing now matters: the
  // branch is the checkout in this mode, and landing from elsewhere would
  // rebase and fast-forward a branch the operator is not looking at.
  if (onBranch === false) {
    return {
      ...result,
      blocked: true,
      reason: `the checkout is not on ${branch} — switch to it before landing`,
    }
  }

  return {
    ...result,
    commands: [
      `git -C ${checkoutPath} rebase ${base}`,
      `git -C ${checkoutPath} switch ${base}`,
      `git -C ${checkoutPath} merge --ff-only ${branch}`,
    ],
  }
}

module.exports = { planIntegrate, planIntegrateCheckout }
