'use strict'

/**
 * `push` — repo → remote, three-way aware and ownership-respecting.
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
    return { ok: false, error: `remote project not found: ${projectId}` }
  }
  const remote = normalizeRemote(remoteRaw, config)
  const base = readBase(dir, identifier, config)
  const fields = classify(local, remote, base, config)

  // Remote moved past base only if a *co-authored* (`both`) field diverged on the
  // remote side — that's the case the repo can't safely overwrite without a pull.
  // For a keyed field the equivalent is a same-item conflict (independent edits to
  // different items don't collide, so they don't block). A `pull`-owned change
  // (status/priority/labels) is Linear's to own and must NOT block a content push,
  // and a bare `updatedAt` bump is too coarse to gate on — the pre-write re-read
  // below still catches a racer that lands during the push itself.
  const remoteDivergedFields = fields
    .filter((f) => !f.keyed && f.ownership === 'both' && (f.raw === 'remote-only' || f.raw === 'conflict'))
    .map((f) => f.field)
  for (const f of fields) {
    if (f.keyed) for (const it of f.items) if (it.status === 'conflict') remoteDivergedFields.push(`${f.field}#${it.id}`)
  }
  const moved = remoteDivergedFields.length > 0

  if (moved && !force) {
    return {
      ok: false,
      blocked: true,
      reason: 'remote-moved',
      movedFields: remoteDivergedFields,
      message:
        'push refused — remote moved since the last sync' +
        (remoteDivergedFields.length ? ` (${remoteDivergedFields.join(', ')})` : '') +
        '. Pull first, or re-run with --force (local wins).',
    }
  }

  // Scalar push goes through the project adapter here. Keyed body fields
  // (milestones) can't be written by the offline engine — the provider skill does
  // the MCP create/update and stamps new ids — so the engine emits a *plan* the
  // skill applies. The base still advances to local (below): a created milestone's
  // id:null item is skipped by the keyed compare until the skill stamps it, then
  // it converges on the next sync, so no special base handling is needed.
  const pushFields = fields.filter((f) => f.pushable && !f.keyed)
  // A per-field create/update plan for each keyed collection. The item content
  // (minus its id) is exactly what the skill sends to the Linear save tool.
  const keyedPush = {}
  for (const f of fields) {
    if (!f.keyed) continue
    const strip = (obj) => {
      const { [f.idKey]: _omit, ...rest } = obj
      return rest
    }
    const plan = { create: [], update: [] }
    // Edits to already-linked items (matched by id) → update.
    for (const it of f.items) {
      if (!it.pushable || !it.local) continue
      if (it.status !== 'added') plan.update.push({ id: it.id, ...strip(it.local) })
    }
    // Unlinked local items (no id yet) are new content to create; the keyed
    // compare skips them (nothing to key on), so collect them straight from local.
    const localItems = Array.isArray(local[f.field]) ? local[f.field] : []
    for (const li of localItems) if (li && li[f.idKey] == null) plan.create.push(strip(li))
    if (plan.create.length || plan.update.length) keyedPush[f.field] = plan
  }
  const hasKeyedPush = Object.keys(keyedPush).length > 0

  if (!pushFields.length && !hasKeyedPush && !force) {
    return { ok: true, blocked: false, written: [], skipped: [], note: 'nothing to push' }
  }

  // Optimistic concurrency: re-read immediately before writing to catch a racer.
  const remoteRaw2 = await adapter.readProject(projectId)
  if (remoteRaw2 && remoteRaw2.updatedAt !== remoteRaw.updatedAt && !force) {
    return {
      ok: false,
      blocked: true,
      reason: 'concurrent-write',
      message: 'push refused — remote changed during the push. Pull first, or --force.',
    }
  }

  // --force clobbers the remote side — back it up first.
  let backupPath = null
  if (force) {
    backupPath = backup('remote', dir, identifier, config, { timestamp, data: remoteRaw2 || remoteRaw })
  }

  const updates = {}
  for (const f of pushFields) updates[f.field] = local[f.field]
  const updated = Object.keys(updates).length
    ? (await adapter.updateProject(projectId, updates)) || remoteRaw2 || remoteRaw
    : remoteRaw2 || remoteRaw
  const updatedRemote = normalizeRemote(updated, config)

  // Reconciled base: local is the source of truth for the fields we pushed (and
  // for unchanged/local-only fields); pull-owned fields keep remote's value so
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
    // The skill applies these Linear writes (create → stamp the new id back into
    // the phase file / task line; update → save by id). Omitted when empty.
    ...(keyedPush.milestones ? { milestonesPush: keyedPush.milestones } : {}),
    ...(keyedPush.tasks ? { issuesPush: keyedPush.tasks } : {}),
    skipped: fields
      .filter((f) => !f.pushable && !f.keyed && f.status !== 'unchanged')
      .map((f) => f.field),
    backupPath,
    basePath,
  }
}

module.exports = { push }
