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
 * @param {object} spec  resolved spec: { slug, worktreePath, projectName, ... }
 * @param {object} config normalised env config.
 * @param {object} flags { keepVolumes, force }
 * @param {object} ctx   { worktreeState: { dirty, unpushed }, timestamp }
 * @returns {object} { blocked, reason, commands, backupCommand, backupPath,
 *                     volumesDropped }
 */
function planDown(spec, config, flags, ctx) {
  const { worktreeState = {}, timestamp } = ctx || {}
  const force = Boolean(flags && flags.force)
  const keepVolumes = Boolean(flags && flags.keepVolumes)

  // --- guards (overridable with --force) ---
  if (!force) {
    if (config.guards.refuseTeardownIfDirty && worktreeState.dirty) {
      return blocked('worktree has uncommitted changes')
    }
    if (config.guards.refuseTeardownIfUnpushed && worktreeState.unpushed) {
      return blocked('worktree has unpushed commits')
    }
  }

  const commands = []
  const volumesDropped = !keepVolumes && config.docker.enabled

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
  if (config.docker.enabled) {
    const base = `docker compose --project-name ${spec.projectName} down`
    commands.push(volumesDropped ? `${base} --volumes` : base)
  }

  // --- remove the worktree (force needed if we bypassed a dirty guard) ---
  commands.push(
    force
      ? `git worktree remove --force ${spec.worktreePath}`
      : `git worktree remove ${spec.worktreePath}`,
  )

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
