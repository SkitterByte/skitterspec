'use strict'

/**
 * The three-way compare at the heart of the hybrid sync.
 *
 * `classify(local, remote, base, config)` compares each configured field across
 * the local snapshot, the remote (Linear) projection, and the committed base
 * (the last-synced state). Per field it returns a raw three-way `status`
 * (unchanged / local-only / remote-only / conflict), then collapses it through
 * the field's ownership (`both|pull|push`) into effective `pushable` / `pullable`
 * flags. Ownership is what makes most "both sides differ" cases *not* a real
 * conflict:
 *   - a `pull` field never pushes (Linear wins) → conflict collapses to remote-only
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
  const baseObj = base || {}
  return Object.keys(ownership).map((field) => {
    const own = ownership[field]
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
  hashField,
  stableStringify,
  rawStatus,
  collapse,
}
