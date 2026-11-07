'use strict'

/**
 * `readStatus` — what the tracker says about one spec's ticket, read live.
 *
 * Under `sync.fieldOwnership: "pull"` the tracker is the record for status and
 * assignee, so the repo reads them when it needs to SAY something and never
 * stores what it read. Every provider's adapter already answers `readIssue`
 * with the same normalised shape — `state: { name }`, `assignee: { id, name }`
 * — and each provider's `config.remote.stateName` hook reads its own status
 * (GitHub's board column, Azure's System.State), so one function serves all
 * four.
 *
 * THREE ANSWERS, and the third is most of them: a reading, a reading whose
 * state maps to no bucket (`bucket: null` — somewhere the repo does not manage,
 * never a disagreement), and cannot-tell. No adapter, no credential, a network
 * failure and a missing ticket are all cannot-tell; none is evidence about the
 * spec, so a caller that accuses on one is wrong (`negative-checks.md`).
 */

const { remoteStateReading, ownershipOf } = require('@skitterbyte/skitterspec-sync-core')

const firstLine = (error) => String((error && error.message) || error).split('\n')[0]

/**
 * @param {object} p
 *   - `adapter` an API adapter with `readIssue`
 *   - `ref`     the ticket's identifier, as the adapter takes it
 *   - `config`  the provider config (for the state mapping)
 * @returns {Promise<{ ok: true, state: string|null, bucket: string|null, assignee: object|null }
 *                  | { ok: false, reason: string }>}
 */
async function readStatus({ adapter, ref, config }) {
  if (!adapter || typeof adapter.readIssue !== 'function') return { ok: false, reason: 'no API adapter' }
  if (!ref) return { ok: false, reason: 'not linked' }
  let issue
  try {
    issue = await adapter.readIssue(ref)
  } catch (error) {
    return { ok: false, reason: firstLine(error) }
  }
  if (!issue) return { ok: false, reason: `${ref} not found` }
  const reading = remoteStateReading(issue, config)
  const assignee = issue.assignee && issue.assignee.id ? { id: issue.assignee.id, name: issue.assignee.name || null } : null
  return {
    ok: true,
    state: reading ? reading.name : null,
    bucket: reading && reading.mapped ? reading.bucket : null,
    assignee,
  }
}

/**
 * `spec-sync ownership [--json]` — who owns a spec's status and assignee here.
 *
 * This is the question the shared skills ask before writing a `Status:` header,
 * a `Developer:` line or a State-log row: the base skills are tracker-free and
 * cannot read a provider config, so they ask the provider's CLI rather than
 * deciding from which provider is installed. Offline, and always exit 0 — a
 * missing config never reaches here (the CLI reports sync is off first), and
 * that is the skills' cannot-tell, which writes the headers as before.
 */
function specSyncOwnership(config, flags, out, program = 'spec-sync') {
  const owners = { workflowState: ownershipOf(config, 'workflowState'), assignee: ownershipOf(config, 'assignee') }
  if (flags && flags.json) {
    out.write(JSON.stringify(owners, null, 2) + '\n')
    return 0
  }
  out.write(`${program} ownership: status ${owners.workflowState} · assignee ${owners.assignee}\n`)
  return 0
}

module.exports = { readStatus, specSyncOwnership }
