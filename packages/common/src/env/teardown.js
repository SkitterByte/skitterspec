'use strict'

/**
 * Pure teardown planner for `spec-env down`.
 *
 * `planDown` evaluates the dirty/unpushed guards, plans an optional config-driven
 * pre-drop backup, and returns the exact commands the `/spec-env-down` skill runs
 * (`docker compose down` [+`--volumes`], `git worktree remove`). It performs no
 * side effects: the caller (the CLI) queries git for `worktreeState` and supplies
 * a `timestamp`, keeping this deterministic and unit-testable with no live
 * git/docker.
 *
 * Volumes are the only destructive action — dropped by default (reclaims disk)
 * unless `--keep-volumes`, and always backed up first when a `backupCommand` is
 * configured.
 */

const { expandTokens } = require('./resolve.js')

/**
 * @param {object} spec  resolved spec: { slug, branch, worktreePath, projectName, ... }
 * @param {object} config normalised env config.
 * @param {object} flags { keepVolumes, force }
 * @param {object} ctx   { worktreeState: { dirty, unpushed, merged, reachableFromTag }, timestamp }
 * @returns {object} { blocked, reason, commands, backupCommand, backupPath,
 *                     volumesDropped }
 */
function planDown(spec, config, flags, ctx) {
  const { worktreeState = {}, timestamp } = ctx || {}
  const force = Boolean(flags && flags.force)
  const keepVolumes = Boolean(flags && flags.keepVolumes)

  // A hotfix lands by tag + cherry-pick, so its branch is never an ancestor of
  // base — but once its head is captured by a tag (the deploy tag from
  // `hotfix land`), the commits are recoverable and the branch is safe to drop.
  // Treat "reachable from a tag" as landed, alongside merged. Read twice below:
  // it decides whether the unpushed guard blocks, and whether the branch delete
  // can use `-D` — the same question ("are these commits recoverable?"), so the
  // two must never answer it differently.
  const landed = Boolean(worktreeState.merged || worktreeState.reachableFromTag)

  // --- guards (overridable with --force) ---
  if (!force) {
    if (config.guards.refuseTeardownIfDirty && worktreeState.dirty) {
      return blocked('worktree has uncommitted changes')
    }
    // Unpushed commits are only unsafe when they aren't already integrated into
    // the base branch (or captured by a tag). A landed branch carries nothing to
    // lose even with no remote — so /spec-complete's local land-then-teardown
    // needs no --force. Block only when unpushed AND not landed.
    if (config.guards.refuseTeardownIfUnpushed && worktreeState.unpushed && !landed) {
      return blocked('worktree has unpushed commits not yet merged into the base branch')
    }
  }

  // Docker teardown only applies to a Docker-escalated spec. A worktree-only spec
  // (Stack: worktree) has no stack/volumes even when the project master switch is
  // on — tearing it down is just removing the worktree. A spec resolved without an
  // explicit stack (legacy/tests) follows the master switch (pre-`Stack` behaviour).
  const stack = spec.stack || (config.docker.enabled ? 'docker' : 'worktree')
  const wantsDocker = stack === 'docker' && config.docker.enabled

  const commands = []
  const volumesDropped = !keepVolumes && wantsDocker

  // --- optional pre-drop backup (only when volumes are actually dropped) ---
  let backupCommand = null
  let backupPath = null
  if (volumesDropped && config.docker.backupCommand) {
    backupPath = `.spec-env/backups/${spec.slug}-${timestamp}.dump`
    backupCommand = expandTokens(config.docker.backupCommand, {
      backupPath,
      slug: spec.slug,
      projectName: spec.projectName,
      timestamp: String(timestamp),
    })
    commands.push(backupCommand)
  }

  // --- docker compose down (drop volumes unless kept) ---
  if (wantsDocker) {
    const base = `docker compose --project-name ${spec.projectName} down`
    commands.push(volumesDropped ? `${base} --volumes` : base)
  }

  // --- remove the worktree (force needed if we bypassed a dirty guard) ---
  commands.push(
    force
      ? `git worktree remove --force ${spec.worktreePath}`
      : `git worktree remove ${spec.worktreePath}`,
  )

  // --- delete the branch ---
  // Runs after the worktree remove frees the branch. `-D` exactly when we have
  // PROVEN the commits survive the delete, `-d` otherwise.
  //
  // `-d` looks like the safe default and mostly is, but its refusal answers a
  // different question from ours: it also declines a branch that is ahead of its
  // upstream ref, reporting `not yet merged to refs/remotes/origin/<branch>,
  // even though it is merged to HEAD`. That fires on the ordinary spec flow —
  // `/spec-go` pushes the branch when it provisions, and the phase commits after
  // it are landed locally rather than pushed — so teardown meets a branch whose
  // every commit is on `main` and `-d` refuses it. `merged` (HEAD is an ancestor
  // of base) already establishes what we actually care about, and establishes it
  // more strongly than `-d` checks.
  //
  // `reachableFromTag` is the same argument for a hotfix: never an ancestor of
  // base, but its head is captured by the deploy tag.
  //
  // Everything else keeps `-d`, so a forced teardown of a genuinely unlanded
  // branch fails loudly and the skill relays it rather than -D-ing.
  if (spec.branch) {
    commands.push(`git branch ${landed ? '-D' : '-d'} ${spec.branch}`)
  }

  return { blocked: false, reason: null, commands, backupCommand, backupPath, volumesDropped }
}

function blocked(reason) {
  return {
    blocked: true,
    reason,
    commands: [],
    backupCommand: null,
    backupPath: null,
    volumesDropped: false,
  }
}

module.exports = { planDown }
