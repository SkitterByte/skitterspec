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
//
// The COMBINED hash, retained for snapshots written before the fields were split
// (and read by any older CLI still pointed at this repo). New pushes diff
// `issueFields` below; this stays so neither direction breaks on the other.
function specIssueHash(p) {
  return hashField({ description: p.description ?? null, state: p.status ?? null })
}

// Per-field hashes of the same two values.
//
// They are hashed SEPARATELY because they have different owners once a spec is
// finished. The repo owns the description forever, but the workflow state is
// handed off: a deploy pipeline (see `release.stages`) moves the issue past
// `complete`, and welding the two meant any prose edit re-emitted the state and
// dragged the issue back. Diffing them apart is what lets a push touch the
// description without re-asserting a state someone else now owns.
function specIssueFieldHashes(p) {
  return {
    description: hashField(p.description ?? null),
    state: hashField(p.status ?? null),
  }
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
    // Both shapes are written: `issueFields` is what a current push diffs, and
    // `issue` keeps a snapshot readable by anything still expecting the combined
    // hash. Cheap insurance — two SHA-1s of text already in hand.
    issue: specIssueHash(p),
    issueFields: specIssueFieldHashes(p),
    subIssues: byId(p.subIssues, subIssueHash),
  }
}

/**
 * Diff the local projection against the last-pushed snapshot.
 * @returns {{ issue?: object, subIssues: {create,update} }}
 *   create items carry a `ref` (local handle) and no id; update items carry both
 *   — the `ref` because the read-back check matches sub-issues to phases BY ref,
 *   and an update with only an id makes every one of them look unmatched.
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
      subIssues.update.push({ ref: s.ref, id: s.id, name: s.name, goal: s.goal, state: s.state })
    }
  }

  const plan = { subIssues }
  const issue = issueChanges(p, snap)
  if (issue) plan.issue = issue
  return plan
}

/**
 * What changed about the spec issue itself — `{description}`, `{state}`, or
 * both, or null when neither did.
 *
 * Three states, not two: a snapshot may carry the split hashes, only the old
 * combined one, or nothing at all. Only the first can say which field moved.
 *
 * The other two are UNKNOWN, and route to the harmless branch — today's welded
 * behaviour, sending both fields. Sending a state that did not change is
 * redundant; withholding one that did would leave the mirror silently stale, and
 * that is the failure worth avoiding. The push rewrites the snapshot in the new
 * shape, so a spec passes through `unknown` exactly once.
 */
function issueChanges(projection, snapshot) {
  const p = projection || {}
  const snap = snapshot || {}
  const both = () => ({ description: p.description ?? null, state: p.status ?? null })

  const fields = snap.issueFields
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    // No split hashes recorded: an old snapshot, or no snapshot at all (a
    // create, which needs both fields anyway).
    return snap.issue === specIssueHash(p) ? null : both()
  }

  const want = specIssueFieldHashes(p)
  const changed = {}
  if (fields.description !== want.description) changed.description = p.description ?? null
  if (fields.state !== want.state) changed.state = p.status ?? null
  return Object.keys(changed).length ? changed : null
}

// True when a plan would push nothing.
function isEmptyPlan(plan) {
  return !plan.issue && !plan.subIssues.create.length && !plan.subIssues.update.length
}

module.exports = {
  planChanges,
  issueChanges,
  specIssueFieldHashes,
  snapshotOf,
  isEmptyPlan,
  hashField,
  stableStringify,
  specIssueHash,
  subIssueHash,
}
