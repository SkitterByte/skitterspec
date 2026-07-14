'use strict'

/**
 * Pure provisioning planner for `spec-env up`.
 *
 * Given a resolved spec and its allocated slot, `planUp` returns the exact
 * side-effecting commands the `/spec-env` skill runs (`git worktree add`,
 * `docker compose up`), the rendered `.env` contents, and the expanded opener —
 * but performs no side effects itself. The caller (the CLI) reads/allocates the
 * registry and passes the slot; this stays deterministic and unit-testable with
 * no live git/docker.
 */

const { portOffset } = require('./registry.js')
const { renderEnvFile, expandOpenCommand } = require('./render.js')

/**
 * Plan a provisioning run.
 *
 * @param {object} spec  resolved spec (from resolveSpec): { slug, type, branch,
 *                       worktreePath, projectName, ... }
 * @param {object} alloc { slot, attached } — attached:true when the slot already
 *                       existed in the registry (re-run → attach, don't clobber).
 * @param {object} config normalised env config.
 * @returns {object} { worktreePath, branch, projectName, slot, portOffset,
 *                     envContents, openCommand, commands, attached }
 */
function planUp(spec, alloc, config) {
  const { slot, attached } = alloc

  // Per-spec escalation: bring Docker up only when this spec's Stack is `docker`,
  // gated by the project master switch. A spec resolved without an explicit stack
  // (legacy/tests) follows the master switch — preserving pre-`Stack` behaviour.
  const stack = spec.stack || (config.docker.enabled ? 'docker' : 'worktree')
  const wantsDocker = stack === 'docker' && config.docker.enabled

  // Slot, port block and `.env` are Docker-only. A worktree-only spec takes none
  // of them: no registry slot, no PORT_OFFSET, no `.env`.
  const offset = wantsDocker ? portOffset(slot, config) : null
  const envContents = wantsDocker
    ? renderEnvFile({ projectName: spec.projectName, portOffset: offset })
    : null

  const openCommand = expandOpenCommand(config.open.command, {
    worktreePath: spec.worktreePath,
    slug: spec.slug,
    branch: spec.branch,
    projectName: spec.projectName,
    portOffset: offset === null ? '' : String(offset),
  })

  const commands = []
  // Fresh branch → -b; attach an existing branch/slot → plain form (never clobber).
  commands.push(
    attached
      ? `git worktree add ${spec.worktreePath} ${spec.branch}`
      : `git worktree add ${spec.worktreePath} -b ${spec.branch}`,
  )
  if (wantsDocker) {
    commands.push(`docker compose --project-name ${spec.projectName} up -d`)
  }

  return {
    worktreePath: spec.worktreePath,
    branch: spec.branch,
    projectName: spec.projectName,
    slot: wantsDocker ? slot : null,
    portOffset: offset,
    envContents,
    openCommand,
    commands,
    attached,
  }
}

module.exports = { planUp }
