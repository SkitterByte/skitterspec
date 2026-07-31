'use strict'

/**
 * `pull` — remote → repo, three-way aware.
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
const { writeFrontmatter, applyMilestonesPull, applyTasksPull } = require('./write.js')
const { frontmatterPatchFor } = require('./apply.js')

// Collect the conflicting units across scalar (field-level) and keyed
// (item-level) fields, as stable labels for the refusal message.
function collectConflicts(fields) {
  const out = []
  for (const f of fields) {
    if (f.keyed) {
      for (const it of f.items) if (it.status === 'conflict') out.push(`${f.field}#${it.id}`)
    } else if (f.status === 'conflict') {
      out.push(f.field)
    }
  }
  return out
}

async function pull({ dir, snapshotDir, identifier, projectId, adapter, config, force = false, timestamp }) {
  const local = normalizeLocal(snapshotDir, config)
  const remoteRaw = await adapter.readProject(projectId)
  if (!remoteRaw) {
    return { ok: false, error: `remote project not found: ${projectId}` }
  }
  const remote = normalizeRemote(remoteRaw, config)
  const base = readBase(dir, identifier, config)
  const fields = classify(local, remote, base, config)

  const conflicts = collectConflicts(fields)
  if (conflicts.length && !force) {
    return {
      ok: false,
      blocked: true,
      reason: 'conflict',
      conflicts,
      message: `pull refused — ${conflicts.length} unit(s) changed on both sides: ` +
        `${conflicts.join(', ')}. Resolve locally or re-run with --force (remote wins).`,
    }
  }

  // --force overwrites local edits — back the local side up first.
  let backupPath = null
  if (force) {
    backupPath = backup('local', dir, identifier, config, { timestamp, data: local })
  }

  // Keyed body fields (e.g. milestones) — apply per-item via the denormalizer,
  // which writes/creates the matching phase files. Removals are report-only.
  const keyedApplied = []
  const keyedCreated = []
  const keyedReported = []
  for (const f of fields) {
    if (!f.keyed) continue
    const apply = f.field === 'tasks' ? applyTasksPull : applyMilestonesPull
    const res = apply(snapshotDir, f.items)
    if (res.applied.length || res.created.length) keyedApplied.push(f.field)
    keyedCreated.push(...res.created)
    keyedReported.push(...res.reported.map((id) => `${f.field}#${id}`))
  }

  // Scalar pull-owned fields → frontmatter (keyed fields handled above).
  const scalarPull = fields.filter((f) => f.pullable && !f.keyed)
  const fieldValues = {}
  for (const f of scalarPull) fieldValues[f.field] = remote[f.field]
  const { patch, applied, deferred } = frontmatterPatchFor(fieldValues, config)

  if (applied.length || timestamp) {
    writeFrontmatter(snapshotDir, config, { ...patch, last_synced_at: timestamp })
  }

  // Re-normalize local so the base reflects the phase-file writes we just made,
  // then advance base: scalar-applied fields take the remote value; keyed fields
  // take the (now-updated) local value so applied items read in-sync and any
  // report-only removal stays pending.
  const newLocal = normalizeLocal(snapshotDir, config)
  const newBase = { ...newLocal }
  for (const field of applied) newBase[field] = remote[field]
  newBase.__meta = { updatedAt: remoteRaw.updatedAt || null, syncedAt: timestamp }
  const basePath = writeBase(dir, identifier, config, newBase)

  return {
    ok: true,
    blocked: false,
    applied,
    deferred,
    keyedApplied,
    keyedCreated,
    keyedReported,
    conflictsForced: force ? conflicts : [],
    backupPath,
    basePath,
    pulled: [...scalarPull.map((f) => f.field), ...keyedApplied],
  }
}

module.exports = { pull }
