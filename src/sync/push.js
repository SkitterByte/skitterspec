'use strict'

/**
 * `push` — repo → Linear, three-way aware and ownership-respecting.
 *
 * Never writes a `pull`-owned field or a `localOnlySection` (those aren't in the
 * pushable set / the field set at all). Optimistic concurrency: if the remote has
 * moved past the base — detected both by the classifier (any remote-only/conflict
 * field) and by the recorded `updatedAt` — it aborts with "pull first" unless
 * `--force`. It also **re-reads the remote immediately before writing** to catch a
 * writer that raced in during the compare. `--force` makes local win after backing
 * up the remote side. On success it rewrites the base and stamps `last_synced_at`.
 *
 * Pure orchestration over an injected `adapter` (readProject + updateProject) and
 * injected `timestamp`. Tests drive it with a fake in-memory adapter.
 */

const { normalizeLocal, normalizeRemote } = require('./normalize.js')
const { classify } = require('./compare.js')
const { readBase, writeBase, backup } = require('./base.js')
const { writeFrontmatter } = require('./write.js')

async function push({ dir, snapshotDir, identifier, projectId, adapter, config, force = false, timestamp }) {
  const local = normalizeLocal(snapshotDir, config)
  const remoteRaw = await adapter.readProject(projectId)
  if (!remoteRaw) {
    return { ok: false, error: `Linear project not found: ${projectId}` }
  }
  const remote = normalizeRemote(remoteRaw, config)
  const base = readBase(dir, identifier, config)
  const baseStamp = base && base.__meta ? base.__meta.updatedAt : null
  const fields = classify(local, remote, base, config)

  // Remote moved past base if the classifier sees remote-side divergence OR the
  // recorded updatedAt no longer matches (a change we can't even see as a field).
  const remoteDivergedFields = fields
    .filter((f) => f.raw === 'remote-only' || f.raw === 'conflict')
    .map((f) => f.field)
  const stampMoved = baseStamp != null && remoteRaw.updatedAt !== baseStamp
  const moved = remoteDivergedFields.length > 0 || stampMoved

  if (moved && !force) {
    return {
      ok: false,
      blocked: true,
      reason: 'remote-moved',
      movedFields: remoteDivergedFields,
      message:
        'push refused — Linear moved since the last sync' +
        (remoteDivergedFields.length ? ` (${remoteDivergedFields.join(', ')})` : '') +
        '. Pull first, or re-run with --force (local wins).',
    }
  }

  const pushFields = fields.filter((f) => f.pushable)
  if (!pushFields.length && !force) {
    return { ok: true, blocked: false, written: [], skipped: [], note: 'nothing to push' }
  }

  // Optimistic concurrency: re-read immediately before writing to catch a racer.
  const remoteRaw2 = await adapter.readProject(projectId)
  if (remoteRaw2 && remoteRaw2.updatedAt !== remoteRaw.updatedAt && !force) {
    return {
      ok: false,
      blocked: true,
      reason: 'concurrent-write',
      message: 'push refused — Linear changed during the push. Pull first, or --force.',
    }
  }

  // --force clobbers the remote side — back it up first.
  let backupPath = null
  if (force) {
    backupPath = backup('remote', dir, identifier, config, { timestamp, data: remoteRaw2 || remoteRaw })
  }

  const updates = {}
  for (const f of pushFields) updates[f.field] = local[f.field]
  const updated = (await adapter.updateProject(projectId, updates)) || remoteRaw2 || remoteRaw
  const updatedRemote = normalizeRemote(updated, config)

  // Reconciled base: local is the source of truth for the fields we pushed (and
  // for unchanged/local-only fields); pull-owned fields keep Linear's value so
  // they don't read as pending next time.
  const newBase = { ...local }
  for (const [field, own] of Object.entries(config.sync.fieldOwnership)) {
    if (own === 'pull') newBase[field] = updatedRemote[field]
  }
  newBase.__meta = { updatedAt: updated.updatedAt || null, syncedAt: timestamp }
  const basePath = writeBase(dir, identifier, config, newBase)

  if (timestamp) writeFrontmatter(snapshotDir, config, { last_synced_at: timestamp })

  return {
    ok: true,
    blocked: false,
    written: pushFields.map((f) => f.field),
    skipped: fields
      .filter((f) => !f.pushable && f.status !== 'unchanged')
      .map((f) => f.field),
    backupPath,
    basePath,
  }
}

module.exports = { push }
