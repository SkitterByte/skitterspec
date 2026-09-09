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
  const hashes = {
    description: hashField(p.description ?? null),
    state: hashField(p.status ?? null),
  }
  // ONLY WHEN THE FIELD IS IN PLAY. A repo that has not opted `assignee` into
  // `sync.fieldOwnership` must not accumulate assignee hashes in its snapshots —
  // "the feature is inert" has to include the files it writes, or opting in later
  // would find a history of hashes it never agreed to.
  if (p.assignee !== undefined) hashes.assignee = hashField(p.assignee ?? null)
  return hashes
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
 *   `unstamped` (when present) lists phases whose stamp is missing while the
 *   snapshot still remembers an unminted-for id — ambiguous, so neither created
 *   nor updated. create items carry a `ref` (local handle) and no id; update items carry both
 *   — the `ref` because the read-back check matches sub-issues to phases BY ref,
 *   and an update with only an id makes every one of them look unmatched.
 *   `plan.issue` (when present) is the spec issue's description + state; the push
 *   skill applies `config.linear.projectId` grouping on top of it.
 */
function planChanges(projection, snapshot) {
  const p = projection || {}
  const snap = snapshot || {}
  const snapS = snap.subIssues || {}

  // Ids the last push minted that no phase claims any more. A phase file's stamp
  // is the only link back to its sub-issue, and it lives in frontmatter — so a
  // whole-file rewrite, a hand edit or a bad merge drops it while the sub-issue
  // carries on existing. This snapshot is the only memory that it was ever
  // minted, and nothing else in the push path re-reads the tracker.
  const claimed = new Set()
  for (const s of p.subIssues || []) if (s.id != null) claimed.add(String(s.id))
  const unclaimed = Object.keys(snapS).filter((id) => !claimed.has(id))

  const subIssues = { create: [], update: [] }
  const unstamped = []
  for (const s of p.subIssues || []) {
    if (s.id == null) {
      // THREE STATES, NOT TWO. "No stamp" means "new phase" only when every id
      // the snapshot remembers is still claimed. With an unclaimed id sitting
      // beside an unstamped phase the two readings — a new phase, and a phase
      // whose stamp was lost — are indistinguishable from here, so this routes to
      // the harmless branch and mints nothing. Being wrong this way costs a
      // re-stamp; the other way cost a duplicate sub-issue and a manual cancel.
      if (unclaimed.length) {
        unstamped.push({ ref: s.ref, name: s.name, candidates: unclaimed.slice() })
      } else {
        subIssues.create.push({ ref: s.ref, name: s.name, goal: s.goal, state: s.state })
      }
    } else if (snapS[String(s.id)] !== subIssueHash(s)) {
      subIssues.update.push({ ref: s.ref, id: s.id, name: s.name, goal: s.goal, state: s.state })
    }
  }

  const plan = { subIssues }
  if (unstamped.length) plan.unstamped = unstamped
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
  const both = () => {
    const out = { description: p.description ?? null, state: p.status ?? null }
    // ASSERT, NEVER CLEAR, on this path. There are no split hashes here, so
    // whether an assignee was ever pushed is unknown — and the harmless reading
    // of "unknown" is to send one we have and stay silent about one we don't.
    if (p.assignee != null) out.assignee = p.assignee
    return out
  }

  const fields = snap.issueFields
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    // No split hashes recorded: an old snapshot, or no snapshot at all (a
    // create, which needs both fields anyway).
    if (snap.issue !== specIssueHash(p)) return both()
    // Description and state are unchanged — but the COMBINED HASH SAYS NOTHING
    // ABOUT THE ASSIGNEE, which was never one of its inputs. Absence of evidence
    // again, and the two directions are not equally safe: asserting an assignee
    // the repo actually recorded costs one redundant write, while staying quiet
    // would strand it until some unrelated prose edit happened to push. Clearing
    // is still never guessed at. The push rewrites the snapshot in the split
    // shape, so a spec passes through here exactly once.
    return p.assignee != null ? { assignee: p.assignee } : null
  }

  const want = specIssueFieldHashes(p)
  const changed = {}
  if (fields.description !== want.description) changed.description = p.description ?? null
  if (fields.state !== want.state) changed.state = p.status ?? null

  // ASSIGNEE — AN ABSENT SNAPSHOT KEY MEANS "NEVER PUSHED", NOT "WAS NULL".
  //
  // What would fool this check: every spec linked before assignee existed has a
  // snapshot with no `assignee` key, and so does every spec in a repo that never
  // opted the field in. Read that absence as `null` and the first push after
  // upgrade computes null → null → "unchanged"… except where a PM had assigned
  // the issue in Linear, which the repo would then silently clear. The bill for
  // getting this wrong is somebody else's triage, workspace-wide, in one command.
  //
  // So absence is routed to the harmless branch: assert an assignee we actually
  // have, and never send a clear at something we never set.
  // (`.claude/rules/negative-checks.md` — prefer a positive signal to an absence,
  // and bias the unknown case toward inaction.)
  if (want.assignee !== undefined) {
    if (fields.assignee === undefined) {
      if (p.assignee != null) changed.assignee = p.assignee
    } else if (fields.assignee !== want.assignee) {
      // A recorded hash IS a positive signal that the repo pushed this field
      // before, so a change to null here is a retraction of our own assignment
      // rather than a guess at someone else's.
      changed.assignee = p.assignee ?? null
    }
  }

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
