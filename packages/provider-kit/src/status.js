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

const path = require('node:path')

const { remoteStateReading, ownershipOf } = require('@skitterbyte/skitterspec-sync-core')
const { makeSpecHelpers } = require('./specs.js')
const { boardDisagreement } = require('./list-rows.js')
const { doctorRow } = require('./doctor.js')

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

/**
 * `spec-sync board <spec> [--json]` — has the board finished what this repo has
 * not? Asked by `/spec-start` and `/spec-next` in pre-flight and by
 * `/spec-status`, so a ticket someone Cancelled or closed as Done reaches the
 * person holding the branch rather than waiting for them to look.
 *
 * SILENT UNLESS IT HAS SOMETHING TO SAY. One line when the board says Done or
 * Cancelled against a spec still in `backlog`/`in-progress`, naming the command
 * that closes it — and nothing at all otherwise: agreement, a board that merely
 * re-planned, an unlinked spec, no credential, an unreadable ticket. Every one of
 * those is either healthy or cannot-tell, and a line about it would teach the
 * reader to skip the one line that matters (`negative-checks.md`). `--json`
 * always answers, so a caller can tell the cases apart. Always exits 0: this
 * reports, and nothing refuses on it.
 *
 * @param {object} p
 *   - `snapshotDir` the resolved spec folder (its bucket is its parent folder)
 *   - `config`      the provider config
 *   - `credential`  `{ ok, adapter, error }` — the provider's API adapter, or why not
 *   - `flags`, `out`, `tracker` (the name in messages), `program`
 */
async function specSyncBoard({ snapshotDir, config, credential, flags = {}, out, tracker, program = 'spec-sync' }) {
  const spec = path.basename(snapshotDir)
  const bucket = path.basename(path.dirname(snapshotDir))
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const ref = makeSpecHelpers({ program }).linkedIdentifier(path.join(snapshotDir, overviewFile), config)
  const answer = (body, line) => {
    if (flags.json) out.write(JSON.stringify({ spec, bucket, issue: ref || null, ...body }, null, 2) + '\n')
    else if (line) out.write(`${program} board: ${line}\n`)
    return 0
  }

  if (!ref) return answer({ reading: null, reason: 'not linked' })
  if (!credential || !credential.ok) {
    return answer({ reading: null, reason: (credential && credential.error ? String(credential.error) : 'no API transport').split('\n')[0] })
  }
  const reading = await readStatus({ adapter: credential.adapter, ref, config })
  if (!reading.ok) return answer({ reading: null, reason: reading.reason })

  const { ok, ...seen } = reading
  const found = reading.bucket ? boardDisagreement(bucket, reading.bucket) : null
  if (!found) return answer({ reading: seen, disagrees: false })
  return answer(
    { reading: seen, disagrees: true, cleanup: found.cleanup },
    `${ref} is ${reading.state} on ${tracker}, but ${spec} is ${bucket} here — ${found.cleanup} closes it`,
  )
}

/**
 * The doctor's one line on ownership: who holds status and assignee here. Always
 * `ok` — both answers are valid configurations, and the line exists so a reader
 * can see which one is in force without opening the config.
 */
function ownershipDoctorRow(config) {
  const status = ownershipOf(config, 'workflowState')
  const assignee = ownershipOf(config, 'assignee')
  return doctorRow('ownership', 'Ownership', 'ok', `status ${status} · assignee ${assignee}`)
}

module.exports = { readStatus, specSyncOwnership, specSyncBoard, ownershipDoctorRow }
