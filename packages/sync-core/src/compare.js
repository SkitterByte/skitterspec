'use strict'

/**
 * One-sided change detection for one-way sync (repo → Linear).
 *
 * The repo is the source of truth; Linear is a generated mirror. We never read
 * remote content. Instead we record a **last-pushed snapshot** — a content hash
 * per object — and diff the current local projection against it:
 *
 *   - an item with no id            → CREATE (never pushed)
 *   - an item whose hash changed    → UPDATE (edited since last push)
 *   - an item whose hash matches    → skip (unchanged)
 *
 * `planChanges(projection, snapshot)` returns the create/update plan the push
 * skill applies over MCP; `snapshotOf(projection)` is what we record afterwards.
 *
 * Pure and deterministic: hashes are a sorted-key JSON → SHA-1, so key order and
 * null/undefined never cause a false diff. No Date.now()/Math.random().
 */

const { createHash } = require('node:crypto')

// Deterministic JSON: object keys sorted recursively; array order preserved.
// undefined normalises to null.
function stableStringify(value) {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

// Stable content hash of a value.
function hashField(value) {
  return createHash('sha1').update(stableStringify(value)).digest('hex')
}

// --- content hashes (id / local handles excluded, so they never affect the
//     diff — an id stamped in after a create must not read as an edit) ---------

function projectHash(p) {
  return hashField({
    description: p.description ?? null,
    status: p.status ?? null,
    priority: p.priority ?? null,
    labels: p.labels ?? null,
  })
}
const milestoneHash = (m) => hashField({ name: m.name ?? null, goal: m.goal ?? null })
const issueHash = (t) => hashField({ title: t.title ?? null, description: t.description ?? null, done: !!t.done })

/**
 * The snapshot to commit after a successful push: a content hash per object that
 * currently has an id. Create items (id == null) aren't recorded until the skill
 * stamps their returned id and the next projection includes it.
 */
function snapshotOf(projection) {
  const p = projection || {}
  const byId = (arr, hash) => {
    const out = {}
    for (const item of arr || []) if (item && item.id != null) out[String(item.id)] = hash(item)
    return out
  }
  return {
    project: projectHash(p),
    milestones: byId(p.milestones, milestoneHash),
    issues: byId(p.issues, issueHash),
  }
}

/**
 * Diff the local projection against the last-pushed snapshot.
 * @returns {{ project?: object, milestones: {create,update}, issues: {create,update} }}
 *   create items carry a `ref` (local handle) and no id; update items carry `id`.
 */
function planChanges(projection, snapshot) {
  const p = projection || {}
  const snap = snapshot || {}
  const snapM = snap.milestones || {}
  const snapI = snap.issues || {}

  const milestones = { create: [], update: [] }
  for (const m of p.milestones || []) {
    if (m.id == null) milestones.create.push({ ref: m.ref, name: m.name, goal: m.goal })
    else if (snapM[String(m.id)] !== milestoneHash(m)) milestones.update.push({ id: m.id, name: m.name, goal: m.goal })
  }

  const issues = { create: [], update: [] }
  for (const t of p.issues || []) {
    if (t.id == null) {
      issues.create.push({ ref: t.ref, title: t.title, description: t.description, done: !!t.done, milestoneRef: t.milestoneRef })
    } else if (snapI[String(t.id)] !== issueHash(t)) {
      issues.update.push({ id: t.id, title: t.title, description: t.description, done: !!t.done })
    }
  }

  const plan = { milestones, issues }
  if (snap.project !== projectHash(p)) {
    plan.project = {
      description: p.description ?? null,
      status: p.status ?? null,
      priority: p.priority ?? null,
      labels: p.labels ?? null,
    }
  }
  return plan
}

// True when a plan would push nothing.
function isEmptyPlan(plan) {
  return (
    !plan.project &&
    !plan.milestones.create.length &&
    !plan.milestones.update.length &&
    !plan.issues.create.length &&
    !plan.issues.update.length
  )
}

module.exports = {
  planChanges,
  snapshotOf,
  isEmptyPlan,
  hashField,
  stableStringify,
  projectHash,
  milestoneHash,
  issueHash,
}
