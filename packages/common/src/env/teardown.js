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
  // Treat "reachable from a tag" as landed, alongside merged.
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
  // Runs after the worktree remove frees the branch. Normally `-d` (safe: refuses
  // an unmerged branch, never -D). A tag-landed hotfix branch is intentionally NOT
  // an ancestor of base, so `-d` would refuse it — but its commits are captured by
  // the deploy tag, so `-D` is safe *only* in that case. Everything else stays `-d`;
  // on a forced teardown of a genuinely unmerged branch it fails loudly and the
  // skill relays it rather than -D-ing.
  if (spec.branch) {
    const tagLanded = Boolean(worktreeState.reachableFromTag && !worktreeState.merged)
    commands.push(`git branch ${tagLanded ? '-D' : '-d'} ${spec.branch}`)
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
