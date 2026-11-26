'use strict'

const path = require('node:path')

/**
 * `push` — repo → Linear, one-way. The repo is the source of truth; Linear is a
 * generated mirror. We never read remote content: `push` builds the local
 * projection, diffs it against the committed **last-pushed snapshot**, and
 * returns a **create/update plan** the provider skill applies over MCP.
 *
 * The skill: applies the plan → stamps each newly-created id back into the phase
 * frontmatter / task line → calls `recordPush`, which re-reads the (now
 * id-stamped) projection and writes the snapshot. That closes the loop: the next
 * `push` sees an unchanged snapshot and produces an empty plan.
 *
 * Pure aside from reading the snapshot; no adapter, no remote read, no
 * Date.now(). `recordPush` writes the snapshot sidecar.
 */

const { normalizeLocal, phasesWithheld, phaseModeFor, ownershipOf, readSnapshot } = require('./normalize.js')
const { descriptionMode } = require('./summary.js')
const { fieldsOf } = require('./fields.js')
const { planChanges, snapshotOf, stateNamesRecord, placementRecord, isEmptyPlan } = require('./compare.js')
const { readBase, writeBase } = require('./base.js')
const { detectLegacyMirror } = require('./legacy.js')

// Build the one-way projection from a local snapshot: the spec issue's prose +
// status, and its phase sub-issues. `status` is the local lifecycle bucket; the
// skill maps it (and each sub-issue's `state`) to the Linear issue-state NAME via
// config.states at apply time.
function projectionOf(snapshotDir, config) {
  const local = normalizeLocal(snapshotDir, config)
  const projection = {
    description: local.description ?? null,
    status: local.workflowState ?? null,
    subIssues: Array.isArray(local.subIssues) ? local.subIssues : [],
    // How many phases `mapping.phases: 'deferred'` is holding back. Reporting
    // only — `snapshotOf`/`specIssueHash` read named fields, so this never
    // reaches a hash and cannot make an unchanged spec look edited.
    phasesWithheld: phasesWithheld(snapshotDir, config),
    // The phase mode that resolved for THIS spec's bucket. Reporting only, on
    // the same terms: a spec with no sub-issues has to read as deliberate rather
    // than as phase files that failed to parse, and with `mapping.phases` now a
    // per-bucket map, which mode applied is no longer readable off the config.
    phaseMode: phaseModeFor(local.workflowState, config),
  }
  // ASSIGNEE IS SET ONLY WHEN THE FIELD IS IN PLAY, and the distinction between
  // `undefined` and `null` is load-bearing all the way down: `undefined` means
  // the repo never opted in, so no hash is recorded and no op is ever emitted;
  // `null` means opted in with nobody assigned, which CAN legitimately clear a
  // previously-pushed assignee. Defaulting the key to null here would collapse
  // the two and make an un-opted-in repo start clearing assignees on its next
  // push. `normalizeLocal` omits the key entirely when `sync.fieldOwnership`
  // does not list it.
  if ('assignee' in local) projection.assignee = local.assignee ?? null
  // The tracker owns the state (`sync.fieldOwnership.workflowState: "pull"`), so
  // a push sends it only as a transition — see `issueChanges`. Set only when
  // pulled, and read by name, so it can never reach a hash.
  if (ownershipOf(config, 'workflowState') === 'pull') projection.statePulled = true
  attachStateNames(projection, snapshotDir, config)
  attachPlacement(projection, snapshotDir, config)
  return projection
}

// Where on the tracker this spec's items belong — Azure's area path, from the
// provider's `config.remote.placement(snapshotDir)` hook: a string when the
// project places specs, `undefined` when it does not (no hook, or the hook
// says the feature is not in play). Read by name, so it never reaches a hash:
// recorded beside them as `placement`, it is what lets a plan see a spec move
// that no field hash covers. A hook that throws REFUSES the plan — a spec
// naming a place the project does not have must not be filed somewhere else —
// but only the plan: the error is carried, not raised, so a status or a list
// over every spec is not taken down by one spec's bad header.
function attachPlacement(projection, snapshotDir, config) {
  const hook = config && config.remote && config.remote.placement
  if (typeof hook !== 'function') return
  let value
  try {
    value = hook(snapshotDir)
  } catch (error) {
    // Tagged, so a caller can relay it as the refusal it is rather than a crash.
    if (error && typeof error === 'object') error.placementRefused = true
    Object.defineProperty(projection, 'placementError', { value: error, enumerable: false })
    return
  }
  if (typeof value === 'string' && value) projection.placement = value
}

// The tracker state NAME each bucket resolves to today, from the provider's
// `config.remote.writtenStateName(bucket, role, snapshotDir)` hook: a string,
// `null` for "this bucket sends no state", or `undefined` for cannot-tell — no
// hook, a hook that threw, or no bucket to resolve. Read by name, so it never
// reaches a hash: recorded beside them as `stateNames`, it is what lets a plan
// see a state-map change the bucket hashes are blind to.
function attachStateNames(projection, snapshotDir, config) {
  const hook = config && config.remote && config.remote.writtenStateName
  if (typeof hook !== 'function') return
  const resolve = (bucket, role) => {
    if (!bucket) return undefined
    try {
      const name = hook(bucket, role, snapshotDir)
      return name === null || typeof name === 'string' ? name : undefined
    } catch {
      return undefined
    }
  }
  const name = resolve(projection.status, 'issue')
  if (name !== undefined) projection.stateName = name
  projection.subIssues = projection.subIssues.map((s) => {
    const sub = resolve(s && s.state, 'subIssue')
    return sub === undefined ? s : { ...s, stateName: sub }
  })
}

// Does the spec carry its issue stamp? NOT `identifier`: callers fall back to the
// folder name for an unlinked spec, so a truthy identifier proves nothing. The
// stamp is the positive signal — it tells a create (no issue yet, so the spec's
// first state IS a transition) from a linked spec whose snapshot cannot say what
// was last sent.
function isLinked(snapshotDir, config) {
  try {
    const { frontmatter } = readSnapshot(snapshotDir, config)
    return !!(frontmatter && frontmatter[fieldsOf(config).identifier])
  } catch {
    return false
  }
}

function push({ dir, snapshotDir, identifier, config }) {
  const projection = projectionOf(snapshotDir, config)
  if (projection.placementError) throw projection.placementError
  const snapshot = readBase(dir, identifier, config)
  const epic = path.basename(String(snapshotDir || '')).startsWith('epic-')
  const plan = planChanges(projection, snapshot, { linked: isLinked(snapshotDir, config), epic })
  // A spec still linked under the pre-9.0 model reads as unlinked here, so the
  // plan above is all-creates and would abandon a live mirror. Carry the finding
  // ON THE PLAN, not as a warning: `--json` routes warnings to stderr, and the
  // skill that applies this plan is exactly the consumer that would miss them.
  const legacy = detectLegacyMirror({ dir, snapshotDir, identifier, config })
  if (legacy) plan.legacy = legacy
  // Same reasoning as `legacy`: carried ON THE PLAN, not as a stderr warning,
  // because `--json` routes warnings to stderr and the skill applying the plan
  // is the consumer that most needs to know the missing sub-issues are deliberate.
  if (projection.phasesWithheld) plan.phasesDeferred = projection.phasesWithheld
  // Always set, unlike the two above: the skill relaying this should not have to
  // know that an absent field means `subissue`. `isEmptyPlan` and `snapshotOf`
  // both read named fields, so an extra key cannot make a spec look edited.
  plan.phaseMode = projection.phaseMode
  // Always set too: under `summary` the planned bodies are BLOCKS, and an
  // apply that writes one over the whole description deletes the team's text.
  // The MCP path reads this to know it must splice (`spec-sync splice`).
  plan.descriptionMode = descriptionMode(config)
  attachPlannedStateNames(plan, projection)
  return { ok: true, empty: isEmptyPlan(plan), plan, projection }
}

// THE NAME TO WRITE, ON THE PLAN, beside each bucket it sends. The API apply
// resolves a bucket per item type (statesByType / statesByKind over `states`);
// a plan applied by hand over MCP used to be told to map it "via
// config.states", which skips those overrides — a done phase Task was written
// the parent's state (bug-azure-phase-done-state). So the plan carries the
// resolution the provider's `writtenStateName` hook made, and the hand apply
// copies it rather than re-deriving it from the wrong table.
//
// Only where the item sends a state, and only where the hook answered: null
// means "this bucket sends no state" and is carried as null; undefined
// (no hook, a hook that threw) adds nothing, so the reader falls back as
// before. Never read by `isEmptyPlan` or `snapshotOf`, which read named fields.
function attachPlannedStateNames(plan, projection) {
  if (plan.issue && plan.issue.state != null && projection.stateName !== undefined) {
    plan.issue.stateName = projection.stateName
  }
  const byRef = new Map((projection.subIssues || []).map((s) => [s && s.ref, s]))
  for (const list of [plan.subIssues && plan.subIssues.create, plan.subIssues && plan.subIssues.update]) {
    for (const item of list || []) {
      if (item.state == null) continue
      const sub = byRef.get(item.ref)
      if (sub && sub.stateName !== undefined) item.stateName = sub.stateName
    }
  }
}

/**
 * Record the last-pushed snapshot from the CURRENT files — call after the skill
 * has applied the plan and stamped new ids. Returns the snapshot path.
 */
// `sent` says which items this push carried a state for — `{ issue, subIssues }`,
// the latter a set of ids. Only those get today's name recorded; anything else
// keeps the name it already had, or none. Recording today's name for an item
// that was NOT sent would claim the tracker holds it, and silence the very remap
// this record exists to catch. Without `sent` (a hand-applied MCP push) nothing
// new is recorded and what was there is kept.
// `keepSubIssues` names ids the projection no longer claims but the tracker may
// still hold — a retire that failed — so the next push plans them again rather
// than forgetting them.
function recordPush({ dir, snapshotDir, identifier, config, sent = null, keepSubIssues = [] }) {
  const projection = projectionOf(snapshotDir, config)
  const snapshot = snapshotOf(projection, config)
  const before = readBase(dir, identifier, config)
  for (const id of keepSubIssues) {
    const hash = before && before.subIssues && before.subIssues[String(id)]
    if (hash !== undefined) snapshot.subIssues[String(id)] = hash
  }
  const names = stateNamesRecord(projection, before, sent)
  if (names) snapshot.stateNames = names
  const placement = placementRecord(projection, before, sent)
  if (placement !== undefined) snapshot.placement = placement
  return writeBase(dir, identifier, config, snapshot)
}

module.exports = { push, recordPush, projectionOf }
