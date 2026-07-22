'use strict'

/**
 * Pure planner for host dev-process supervision (`spec-env dev up|down`).
 *
 * Given a resolved spec and its allocated slot, `planDev` computes — for each
 * configured `dev` process — its resolved port, the env var to inject, the log
 * and pid file paths, the expanded health URL, and the canonical `frontPort` a
 * later proxy (Phase 2) routes to it. No side effects: the CLI's `supervise.js`
 * does the spawning/killing; this stays unit-testable with no processes.
 *
 * Port math: process `i` in the slot's block gets `portBase + slot*portsPerSpec
 * + i` (reusing the same block the Docker stack draws from — see registry.js).
 * So host dev servers get a reserved block even on a worktree-only spec.
 *
 * Log/pid files live beside the registry (default `.spec-env/`) and are keyed by
 * the spec **folder** (not the bare slug) so a `feat-foo`/`bug-foo` pair can't
 * collide — matching how the registry keys slots.
 */

const path = require('node:path')
const { portOffset } = require('./registry.js')
const { expandTokens } = require('./resolve.js')

// The state dir (logs + pids) sits beside the registry file, e.g. `.spec-env`.
function stateDir(config) {
  return path.posix.dirname(config.registry) || '.spec-env'
}

/**
 * Plan the host dev processes for `spec` at `slot`.
 *
 * @returns {object} { slot, portOffset, procs: [{ name, command, port, portVar,
 *   env, frontPort, logFile, pidFile, health }] } — logFile/pidFile are paths
 *   relative to the primary checkout root (the CLI resolves them).
 */
function planDev(spec, slot, config) {
  const base = portOffset(slot, config)
  const dir = stateDir(config)
  const procs = (config.dev || []).map((entry, i) => {
    const port = base + i
    const tokens = {
      [entry.portVar]: String(port),
      port: String(port),
      slug: spec.slug,
      name: entry.name,
    }
    return {
      name: entry.name,
      command: expandTokens(entry.command, tokens),
      port,
      portVar: entry.portVar,
      env: { [entry.portVar]: String(port) },
      frontPort: typeof entry.frontPort === 'number' ? entry.frontPort : null,
      logFile: `${dir}/logs/${spec.folder}-${entry.name}.log`,
      pidFile: `${dir}/pids/${spec.folder}-${entry.name}.pid`,
      health: entry.health ? expandTokens(entry.health, tokens) : null,
    }
  })
  return { slot, portOffset: base, procs }
}

module.exports = { planDev, stateDir }
