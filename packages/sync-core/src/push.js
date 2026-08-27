'use strict'

/**
 * `push` — repo → Linear, one-way. The repo is the source of truth; Linear is a
 * generated mirror. We never read remote content: `push` builds the local
 * projection, diffs it against the committed **last-pushed snapshot**, and
 * returns a **create/update plan** the provider skill applies over MCP.
 *
 * The skill: applies the plan → stamps each newly-created id back into the phase
 * frontmatter / task line → calls `recordPush`, which re-reads the (now
 * id-stamped) projection and writes the snapshot. That closes the loop: the next
 * `push` sees an unchanged snapshot and produces an empty plan.
 *
 * Pure aside from reading the snapshot; no adapter, no remote read, no
 * Date.now(). `recordPush` writes the snapshot sidecar.
 */

const { normalizeLocal } = require('./normalize.js')
const { planChanges, snapshotOf, isEmptyPlan } = require('./compare.js')
const { readBase, writeBase } = require('./base.js')

// Build the one-way projection from a local snapshot: the project prose + status,
// and the milestone/issue items. `status` is the local lifecycle bucket; the
// skill maps it to the Linear project-state NAME via config.states at apply time.
function projectionOf(snapshotDir, config) {
  const local = normalizeLocal(snapshotDir, config)
  return {
    description: local.description ?? null,
    status: local.workflowState ?? null,
    priority: local.priority ?? null,
    labels: Array.isArray(local.labels) ? local.labels : [],
    milestones: Array.isArray(local.milestones) ? local.milestones : [],
    issues: Array.isArray(local.tasks) ? local.tasks : [],
  }
}

function push({ dir, snapshotDir, identifier, config }) {
  const projection = projectionOf(snapshotDir, config)
  const snapshot = readBase(dir, identifier, config)
  const plan = planChanges(projection, snapshot)
  return { ok: true, empty: isEmptyPlan(plan), plan, projection }
}

/**
 * Record the last-pushed snapshot from the CURRENT files — call after the skill
 * has applied the plan and stamped new ids. Returns the snapshot path.
 */
function recordPush({ dir, snapshotDir, identifier, config }) {
  const projection = projectionOf(snapshotDir, config)
  return writeBase(dir, identifier, config, snapshotOf(projection))
}

module.exports = { push, recordPush, projectionOf }
