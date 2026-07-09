'use strict'

/**
 * `pull` — Linear → repo, three-way aware.
 *
 * Applies remote-only fields to the local snapshot; a `both`-owned field where
 * both sides moved off base is a real **conflict** and pull refuses (unless
 * `--force`, which makes remote win after backing up the local side). On success
 * it rewrites the base for the fields it actually reconciled and stamps
 * `last_synced_at`. Body fields with no local frontmatter home yet are reported
 * as `deferred` and their base is deliberately left pending (not falsely synced).
 *
 * Pure orchestration over an injected `adapter` (readProject) + injected
 * `timestamp`; no clock, no MCP knowledge here (that's mcp.js). Tests drive it
 * with a fake in-memory adapter.
 */

const { normalizeLocal, normalizeRemote } = require('./normalize.js')
const { classify } = require('./compare.js')
const { readBase, writeBase, backup } = require('./base.js')
const { writeFrontmatter } = require('./write.js')
const { frontmatterPatchFor } = require('./apply.js')

async function pull({ dir, snapshotDir, identifier, projectId, adapter, config, force = false, timestamp }) {
  const local = normalizeLocal(snapshotDir, config)
  const remoteRaw = await adapter.readProject(projectId)
  if (!remoteRaw) {
    return { ok: false, error: `Linear project not found: ${projectId}` }
  }
  const remote = normalizeRemote(remoteRaw, config)
  const base = readBase(dir, identifier, config)
  const fields = classify(local, remote, base, config)

  const conflicts = fields.filter((f) => f.status === 'conflict').map((f) => f.field)
  if (conflicts.length && !force) {
    return {
      ok: false,
      blocked: true,
      reason: 'conflict',
      conflicts,
      message: `pull refused — ${conflicts.length} field(s) changed on both sides: ` +
        `${conflicts.join(', ')}. Resolve locally or re-run with --force (remote wins).`,
    }
  }

  // Everything remote wants to write down: remote-only fields, plus (under force)
  // both-conflict fields where remote wins.
  const pullFields = fields.filter((f) => f.pullable)
  const fieldValues = {}
  for (const f of pullFields) fieldValues[f.field] = remote[f.field]

  const { patch, applied, deferred } = frontmatterPatchFor(fieldValues, config)

  // --force overwrites local edits — back the local side up first.
  let backupPath = null
  if (force) {
    backupPath = backup('local', dir, identifier, config, { timestamp, data: local })
  }

  // Apply frontmatter-mapped fields + stamp the sync.
  if (applied.length || timestamp) {
    writeFrontmatter(snapshotDir, config, { ...patch, last_synced_at: timestamp })
  }

  // Advance base only for reconciled fields; deferred (body) fields keep the
  // local value as base so the remote edit stays pending, not marked synced.
  const newBase = { ...local }
  for (const field of applied) newBase[field] = remote[field]
  newBase.__meta = { updatedAt: remoteRaw.updatedAt || null, syncedAt: timestamp }
  const basePath = writeBase(dir, identifier, config, newBase)

  return {
    ok: true,
    blocked: false,
    applied,
    deferred,
    conflictsForced: force ? conflicts : [],
    backupPath,
    basePath,
    pulled: pullFields.map((f) => f.field),
  }
}

module.exports = { pull }
