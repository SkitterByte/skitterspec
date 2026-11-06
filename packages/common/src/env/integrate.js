'use strict'

const { globToRegExp } = require('./glob.js')

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
 * @param {object} config normalised env config (reads `afterLand`).
 * In CHECKOUT mode there is no worktree: the branch is already checked out in the
 * primary checkout, so landing is a rebase in place, a switch to base, and the
 * fast-forward. `planIntegrateCheckout` below covers that; the shape of what it
 * returns is identical so callers need no second code path.
 *
 * @param {object} ctx   { worktreeState: { dirty }, base, aheadOfBase, mainRepoPath,
 *                        changedFiles } — `changedFiles` is what the land brings
 *                        in (`base...branch`), or null when it could not be read
 * @returns {object} { blocked, noop, reason, commands, afterLand, base, branch }
 */
function planIntegrate(spec, config, ctx) {
  const { worktreeState = {}, base, aheadOfBase, mainRepoPath } = ctx || {}
  const branch = spec.branch
  const result = {
    blocked: false, noop: false, reason: null, commands: [], afterLand: noAfterLand(), base, branch,
  }

  // The completion edits must be committed first — never rebase a dirty tree.
  if (worktreeState.dirty) {
    return { ...result, blocked: true, reason: 'worktree has uncommitted changes — commit the completion first' }
  }

  // Nothing on the branch that isn't already on base → already landed. The
  // after-land commands still apply: the land may have happened on another
  // machine or in an earlier session, leaving them pending in THIS checkout.
  // That earlier land's range is unknown here, so the range is null.
  if (!aheadOfBase) {
    return { ...result, noop: true, afterLand: afterLandFor(config, mainRepoPath, null) }
  }

  return {
    ...result,
    commands: [
      `git -C ${spec.worktreePath} rebase ${base}`,
      `git -C ${mainRepoPath} merge --ff-only ${branch}`,
    ],
    afterLand: afterLandFor(config, mainRepoPath, rangeOf(ctx)),
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
 * ctx: { dirty, base, aheadOfBase, checkoutPath, onBranch, changedFiles }
 */
function planIntegrateCheckout(spec, config, ctx) {
  const { dirty, base, aheadOfBase, checkoutPath, onBranch } = ctx || {}
  const branch = spec.branch
  const result = {
    blocked: false, noop: false, reason: null, commands: [], afterLand: noAfterLand(), base, branch,
  }

  // "Already landed" is answered FIRST, before any refusal. A landed spec needs
  // no action wherever the checkout happens to be standing — and after a
  // successful land it is standing on base, so asking "not on the branch" here
  // would refuse the very spec this just finished landing. /spec-complete calls
  // integrate again on exactly that state.
  if (!aheadOfBase) {
    return { ...result, noop: true, afterLand: afterLandFor(config, checkoutPath, null) }
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
    afterLand: afterLandFor(config, checkoutPath, rangeOf(ctx)),
  }
}

/**
 * Pure integrate planner for PR mode (`land.strategy: "pr"`).
 *
 * Landing is not a local fast-forward: the branch is rebased onto the REMOTE
 * image of base, pushed, and a pull request carries it the rest of the way —
 * the base branch moves only when the host merges. So the plan ends in a push,
 * and the push is consent-gated with exactly `planHotfixLand`'s shape: a branch
 * already on the remote at HEAD is honoured as the positive signal (`via:
 * "remote"`), `--push` is the operator's recorded yes (`via: "push"`), and
 * otherwise the plan HOLDS (`via: "hold"`) — the push and PR commands go in
 * `holdCommands` for the skill to print, run by nobody until someone consents.
 *
 * `afterLand` is DEFERRED, never emitted: base has not moved when these
 * commands finish, so the project's after-land steps belong to the completion
 * run that follows the host merge. `afterLandPending: "after-merge"` is how the
 * plan says so.
 *
 * One planner serves both modes: `treePath` is the worktree in worktree mode
 * and the primary checkout in checkout mode, and `onBranch` is asked only where
 * the caller supplies it (checkout mode), exactly as `planIntegrateCheckout`
 * asks it.
 *
 * ctx: { worktreeState: { dirty }, base, remote, treePath, aheadOfRemoteBase,
 *        pushedAtHead, push, prCreateCommand, onBranch }
 */
function planIntegratePr(spec, config, ctx) {
  const { worktreeState = {}, base, treePath, onBranch } = ctx || {}
  const remote = (ctx && ctx.remote) || 'origin'
  const branch = spec.branch
  const result = {
    blocked: false, noop: false, reason: null, commands: [],
    push: null, holdCommands: [],
    afterLand: noAfterLand(), afterLandPending: 'after-merge',
    base, branch, remote,
  }

  // "Already landed" is answered FIRST, as the checkout planner does: a landed
  // spec needs no action wherever the tree happens to be standing, and
  // /spec-complete re-runs integrate on exactly that state. ONLY an explicit
  // false lands here: `aheadOfRemoteBase: null` means `<remote>/<base>` could
  // not be read (never fetched, no network), which is an absence — so it plans
  // rather than claiming landed (`.claude/rules/negative-checks.md` rule 4);
  // the plan's own fetch is what makes the next run answerable.
  if (ctx.aheadOfRemoteBase === false) {
    return { ...result, noop: true }
  }
  if (worktreeState.dirty) {
    return { ...result, blocked: true, reason: 'worktree has uncommitted changes — commit the completion first' }
  }
  if (onBranch === false) {
    return { ...result, blocked: true, reason: `the checkout is not on ${branch} — switch to it before landing` }
  }

  const commands = [
    `git -C ${treePath} fetch ${remote} ${base}`,
    `git -C ${treePath} rebase ${remote}/${base}`,
  ]
  // --force-with-lease because the rebase rewrites; -u so the first push sets
  // the upstream the unpushed guard reads.
  const pushCommand = `git -C ${treePath} push --force-with-lease -u ${remote} ${branch}`
  // Composed by the host adapter where one exists; until the caller supplies
  // one, a comment line that cannot be run by accident.
  const prCommand = (ctx && ctx.prCreateCommand)
    || `# open a pull request: ${branch} -> ${base} on ${remote} (gh / az repos)`

  if (ctx.pushedAtHead || ctx.push) {
    // Consent is satisfied — by the operator having already published the
    // branch (the positive signal), or by `--push`. Pushing after the rebase is
    // safe either way: a no-op push says "Everything up-to-date".
    const via = ctx.pushedAtHead ? 'remote' : 'push'
    return {
      ...result,
      commands: [...commands, pushCommand, prCommand],
      push: { kind: 'push', via, remote, branch },
    }
  }
  return {
    ...result,
    commands,
    push: { kind: 'push', via: 'hold', remote, branch },
    holdCommands: [pushCommand, prCommand],
  }
}

// The after-land half of a plan: `config.afterLand`, to run in `cwd` (the
// primary checkout, standing on base) once the land commands have succeeded.
// A blocked plan carries the empty form — nothing landed, so nothing follows.
//
// `range` is the files the land changes: a list (possibly empty) when known,
// null when it is not. Each entry gets a decision — `always` (no `when`),
// `matched` (with the first path that hit), `skipped`, or `unknown` — and
// `commands` is every entry but the skipped ones, in config order.
//
// AN UNKNOWN RANGE RUNS THE CONDITIONAL ENTRIES. A land made elsewhere, or a
// diff git would not answer, says nothing about what changed, and only one
// reading is harmless: a redundant generate costs seconds, a skipped one leaves
// the base red with nothing pointing at why (`.claude/rules/negative-checks.md`
// rule 4). An EMPTY known range is not unknown — a land whose commits touch no
// files is healthy, and it skips them.
function afterLandFor(config, cwd, range = null) {
  const raw = (config && Array.isArray(config.afterLand)) ? config.afterLand : []
  const entries = raw.map((e) => decide(asEntry(e), range))
  const commands = entries.filter((e) => e.decision !== 'skipped').map((e) => e.run)
  return { cwd: entries.length ? cwd : null, commands, entries, range }
}

function decide(entry, range) {
  if (!entry.when) return { ...entry, decision: 'always', matched: null }
  if (range === null) return { ...entry, decision: 'unknown', matched: null }
  const res = entry.when.map(globToRegExp)
  const matched = range.find((f) => res.some((r) => r.test(f)))
  return matched === undefined
    ? { ...entry, decision: 'skipped', matched: null }
    : { ...entry, decision: 'matched', matched }
}

// Normalised config holds `{ run, when }`; a pure caller may still hand over
// the plain string an entry is written as.
function asEntry(entry) {
  return typeof entry === 'string' ? { run: entry, when: null } : { run: entry.run, when: entry.when || null }
}

// `changedFiles` from a planner's ctx, with anything that is not a list read as
// unknown — a caller that did not supply it said nothing about the range.
function rangeOf(ctx) {
  return Array.isArray(ctx && ctx.changedFiles) ? ctx.changedFiles : null
}

function noAfterLand() {
  return { cwd: null, commands: [], entries: [], range: null }
}

module.exports = { planIntegrate, planIntegrateCheckout, planIntegratePr, afterLandFor, rangeOf }
