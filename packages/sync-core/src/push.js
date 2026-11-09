'use strict'

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
const { planChanges, snapshotOf, stateNamesRecord, isEmptyPlan } = require('./compare.js')
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
  return projection
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
  const snapshot = readBase(dir, identifier, config)
  const plan = planChanges(projection, snapshot, { linked: isLinked(snapshotDir, config) })
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
  return { ok: true, empty: isEmptyPlan(plan), plan, projection }
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
function recordPush({ dir, snapshotDir, identifier, config, sent = null }) {
  const projection = projectionOf(snapshotDir, config)
  const snapshot = snapshotOf(projection, config)
  const names = stateNamesRecord(projection, readBase(dir, identifier, config), sent)
  if (names) snapshot.stateNames = names
  return writeBase(dir, identifier, config, snapshot)
}

module.exports = { push, recordPush, projectionOf }
