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

// The spec ISSUE fields the repo owns and pushes: prose + workflow state.
// Priority, labels, cycles and comments are Linear-native triage — one-way sync
// neither pushes nor reads them, so a PM's triage is never clobbered.
function specIssueHash(p) {
  return hashField({ description: p.description ?? null, state: p.status ?? null })
}
// A phase SUB-ISSUE: its name, goal and state (all repo-owned).
const subIssueHash = (s) => hashField({ name: s.name ?? null, goal: s.goal ?? null, state: s.state ?? null })

/**
 * The snapshot to commit after a successful push: the spec-issue hash plus a
 * content hash per sub-issue that currently has an id. Create items (id == null)
 * aren't recorded until the skill stamps their returned id and the next
 * projection includes it.
 */
function snapshotOf(projection) {
  const p = projection || {}
  const byId = (arr, hash) => {
    const out = {}
    for (const item of arr || []) if (item && item.id != null) out[String(item.id)] = hash(item)
    return out
  }
  return {
    issue: specIssueHash(p),
    subIssues: byId(p.subIssues, subIssueHash),
  }
}

/**
 * Diff the local projection against the last-pushed snapshot.
 * @returns {{ issue?: object, subIssues: {create,update} }}
 *   create items carry a `ref` (local handle) and no id; update items carry `id`.
 *   `plan.issue` (when present) is the spec issue's description + state; the push
 *   skill applies `config.linear.projectId` grouping on top of it.
 */
function planChanges(projection, snapshot) {
  const p = projection || {}
  const snap = snapshot || {}
  const snapS = snap.subIssues || {}

  const subIssues = { create: [], update: [] }
  for (const s of p.subIssues || []) {
    if (s.id == null) {
      subIssues.create.push({ ref: s.ref, name: s.name, goal: s.goal, state: s.state })
    } else if (snapS[String(s.id)] !== subIssueHash(s)) {
      subIssues.update.push({ id: s.id, name: s.name, goal: s.goal, state: s.state })
    }
  }

  const plan = { subIssues }
  if (snap.issue !== specIssueHash(p)) {
    plan.issue = { description: p.description ?? null, state: p.status ?? null }
  }
  return plan
}

// True when a plan would push nothing.
function isEmptyPlan(plan) {
  return !plan.issue && !plan.subIssues.create.length && !plan.subIssues.update.length
}

module.exports = {
  planChanges,
  snapshotOf,
  isEmptyPlan,
  hashField,
  stableStringify,
  specIssueHash,
  subIssueHash,
}
