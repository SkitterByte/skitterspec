'use strict'

/**
 * The three-way compare at the heart of the hybrid sync.
 *
 * `classify(local, remote, base, config)` compares each configured field across
 * the local snapshot, the remote (remote) projection, and the committed base
 * (the last-synced state). Per field it returns a raw three-way `status`
 * (unchanged / local-only / remote-only / conflict), then collapses it through
 * the field's ownership (`both|pull|push`) into effective `pushable` / `pullable`
 * flags. Ownership is what makes most "both sides differ" cases *not* a real
 * conflict:
 *   - a `pull` field never pushes (remote wins) → conflict collapses to remote-only
 *   - a `push` field never pulls (repo wins)    → conflict collapses to local-only
 *   - only a `both` field where both sides moved off base is a true `conflict`.
 *
 * Pure and deterministic: field identity is a stable content hash (sorted-key
 * JSON → SHA-1), so `null`, `undefined`, and a missing base all compare equal,
 * and object key order never causes a false diff. No Date.now()/Math.random().
 */

const { createHash } = require('node:crypto')

// Deterministic JSON: object keys sorted recursively; array order preserved
// (order is meaningful for milestones/tasks). undefined normalises to null.
function stableStringify(value) {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

// Stable content hash of a single field value.
function hashField(value) {
  return createHash('sha1').update(stableStringify(value)).digest('hex')
}

// Raw three-way status from the three hashes.
function rawStatus(localH, remoteH, baseH) {
  const localChanged = localH !== baseH
  const remoteChanged = remoteH !== baseH
  if (!localChanged && !remoteChanged) return 'unchanged'
  if (localChanged && !remoteChanged) return 'local-only'
  if (!localChanged && remoteChanged) return 'remote-only'
  // both moved off base — but they may have converged on the same value.
  if (localH === remoteH) return 'unchanged'
  return 'conflict'
}

// --- keyed collections (per-item three-way) --------------------------------

// Index an array of items by their `idKey` value (stringified). Non-arrays and
// items missing the id are skipped — they can't participate in a keyed merge.
function indexById(arr, idKey) {
  const map = new Map()
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (item && typeof item === 'object' && item[idKey] != null) {
        map.set(String(item[idKey]), item)
      }
    }
  }
  return map
}

// Signature of an item under a given id: its content hash with the id stripped
// (so an id-only change / reorder is not a content edit), or 'ABSENT' when the
// id isn't present on that side. 'ABSENT' never collides with a hex hash.
function itemSignature(map, id, idKey) {
  if (!map.has(id)) return 'ABSENT'
  const { [idKey]: _omit, ...content } = map.get(id)
  return hashField(content)
}

// Raw per-item three-way: which side moved off base, and how (added/edited/
// removed). Mirrors rawStatus but tracks presence so add vs edit vs remove is
// distinguishable.
function itemRaw(localSig, remoteSig, baseSig) {
  const localChanged = localSig !== baseSig
  const remoteChanged = remoteSig !== baseSig
  if (!localChanged && !remoteChanged) return { raw: 'unchanged', side: null }
  const kind = (sig, base) => (base === 'ABSENT' ? 'added' : sig === 'ABSENT' ? 'removed' : 'edited')
  if (localChanged && !remoteChanged) return { raw: kind(localSig, baseSig), side: 'local' }
  if (!localChanged && remoteChanged) return { raw: kind(remoteSig, baseSig), side: 'remote' }
  if (localSig === remoteSig) return { raw: 'unchanged', side: null } // both converged
  return { raw: 'conflict', side: null }
}

// Collapse a raw per-item outcome through ownership into an effective status +
// push/pull flags. Removals are report-only in v1 (surfaced, never auto-applied).
function collapseItem({ raw, side }, ownership) {
  const canPush = ownership === 'both' || ownership === 'push'
  const canPull = ownership === 'both' || ownership === 'pull'
  if (raw === 'unchanged') return { status: 'unchanged', side: null, pushable: false, pullable: false, report: false }
  if (raw === 'removed') return { status: 'removed', side, pushable: false, pullable: false, report: true }
  if (raw === 'conflict') {
    if (ownership === 'push') return { status: 'edited', side: 'local', pushable: true, pullable: false, report: false }
    if (ownership === 'pull') return { status: 'edited', side: 'remote', pushable: false, pullable: true, report: false }
    return { status: 'conflict', side: null, pushable: true, pullable: true, report: false }
  }
  // added / edited
  if (side === 'local') return { status: raw, side, pushable: canPush, pullable: false, report: false }
  return { status: raw, side, pushable: false, pullable: canPull, report: false }
}

/**
 * Classify a keyed collection field item-by-item. Returns one entry per id seen
 * across local/remote/base, each with its effective status and push/pull flags,
 * plus the local/remote item values so a caller can apply the change.
 */
function classifyItems(local, remote, base, ownership, idKey) {
  const lMap = indexById(local, idKey)
  const rMap = indexById(remote, idKey)
  const bMap = indexById(base, idKey)
  const ids = new Set([...lMap.keys(), ...rMap.keys(), ...bMap.keys()])
  const items = []
  for (const id of ids) {
    const raw = itemRaw(
      itemSignature(lMap, id, idKey),
      itemSignature(rMap, id, idKey),
      itemSignature(bMap, id, idKey),
    )
    const c = collapseItem(raw, ownership)
    items.push({
      id,
      status: c.status,
      side: c.side,
      pushable: c.pushable,
      pullable: c.pullable,
      report: c.report,
      local: lMap.get(id) || null,
      remote: rMap.get(id) || null,
    })
  }
  return items
}

// Collapse the raw status through ownership into an effective status + flags.
function collapse(raw, ownership) {
  const canPush = ownership === 'both' || ownership === 'push'
  const canPull = ownership === 'both' || ownership === 'pull'

  if (raw === 'unchanged') return { status: 'unchanged', pushable: false, pullable: false }
  if (raw === 'local-only') return { status: 'local-only', pushable: canPush, pullable: false }
  if (raw === 'remote-only') return { status: 'remote-only', pushable: false, pullable: canPull }

  // conflict: both sides diverged off base.
  if (ownership === 'push') return { status: 'local-only', pushable: true, pullable: false }
  if (ownership === 'pull') return { status: 'remote-only', pushable: false, pullable: true }
  return { status: 'conflict', pushable: true, pullable: true }
}

/**
 * Classify every field in `config.sync.fieldOwnership`.
 *
 * @param {object} local  normalized local snapshot (normalizeLocal output)
 * @param {object} remote normalized remote projection (normalizeRemote output)
 * @param {object|null} base the committed base (same shape) or null (never synced)
 * @returns {Array<{field, ownership, raw, status, pushable, pullable}>}
 *   one entry per configured field, in config order.
 */
function classify(local, remote, base, config) {
  const ownership = config.sync.fieldOwnership
  const keyed = (config.sync && config.sync.keyedFields) || {}
  const baseObj = base || {}
  return Object.keys(ownership).map((field) => {
    const own = ownership[field]
    const idKey = keyed[field]

    // Keyed collection: per-item three-way. Field-level flags aggregate the
    // items so existing summary code still sees "does this field have work?".
    if (idKey) {
      const items = classifyItems(
        local ? local[field] : null,
        remote ? remote[field] : null,
        field in baseObj ? baseObj[field] : null,
        own,
        idKey,
      )
      const active = items.filter((i) => i.status !== 'unchanged')
      return {
        field,
        ownership: own,
        keyed: true,
        idKey,
        items,
        status: active.length ? 'items-changed' : 'unchanged',
        pushable: items.some((i) => i.pushable),
        pullable: items.some((i) => i.pullable),
      }
    }

    // Scalar / whole-field (behaviour unchanged).
    const localH = hashField(local ? local[field] : null)
    const remoteH = hashField(remote ? remote[field] : null)
    const baseH = hashField(field in baseObj ? baseObj[field] : null)
    const raw = rawStatus(localH, remoteH, baseH)
    const { status, pushable, pullable } = collapse(raw, own)
    return { field, ownership: own, raw, status, pushable, pullable }
  })
}

module.exports = {
  classify,
  classifyItems,
  hashField,
  stableStringify,
  rawStatus,
  collapse,
}
