'use strict'

/**
 * Shared pieces of `spec-sync list`: what `--state` means, and how a row's
 * board state and its spec's own status are put side by side.
 */

const { remoteStateReading, stateNamesFor, LIFECYCLE_BUCKETS } = require('@skitterbyte/skitterspec-sync-core')

// `--state` takes a lifecycle bucket as well as a tracker state. A bucket
// expands to every tracker name it has (`stateNamesFor`, aliases included); any
// other value is a tracker state, matched as it always was.
function expandStateArgs(args, config) {
  return (args || []).flatMap((arg) => (LIFECYCLE_BUCKETS.includes(arg) ? stateNamesFor(arg, config) : [arg]))
}

// A spec's bucket is a CODE FACT — whether `/spec-start`, `/spec-complete` or
// `/spec-cancel` has run — and the board holds the planning status. So almost
// every difference between the two is the board doing its job: a backlog spec
// the board calls Ready or Blocked, an in-flight one it calls In Review. Neither
// is a claim about the repo, and flagging them would teach a reader to ignore
// the column.
//
// One difference IS worth a reader's time: the board says the work is finished
// (Done or Cancelled) and the repo has not done the matching cleanup. Only that
// pairing disagrees, and it carries the command that would close it.
const LIVE_BUCKETS = ['backlog', 'in-progress']
const FINISHED_BUCKETS = ['complete', 'cancelled']

// `{ board, cleanup }` when the board has finished what the repo has not, else
// null. Done against a spec in flight is `/spec-complete`; every other pairing
// (Cancelled, or Done on a spec that never started) is `/spec-cancel`, because
// there is no work here to complete.
function boardDisagreement(specBucket, boardBucket) {
  if (!LIVE_BUCKETS.includes(specBucket) || !FINISHED_BUCKETS.includes(boardBucket)) return null
  const cleanup = specBucket === 'in-progress' && boardBucket === 'complete' ? '/spec-complete' : '/spec-cancel'
  return { board: boardBucket, cleanup }
}

// The spec's status beside the board's, and whether they disagree in the one
// way above. A board state that maps to no bucket never disagrees: it is
// somewhere push does not manage, which is not a claim about the spec. Nor does
// a row whose spec is not on this machine — there is nothing to disagree WITH.
function specColumn(stateName, spec, config) {
  const specStatus = spec ? spec.bucket : null
  const seen = stateName == null ? null : remoteStateReading({ state: { name: stateName } }, config)
  const found = specStatus && seen && seen.mapped ? boardDisagreement(specStatus, seen.bucket) : null
  return found ? { specStatus, disagrees: true, cleanup: found.cleanup } : { specStatus, disagrees: false }
}

// The cell itself: `in-progress`, `≠ in-progress → /spec-cancel` when the board
// finished it, `—` when the spec is not here.
function specCell({ specStatus, disagrees, cleanup }) {
  if (!specStatus) return '—'
  if (!disagrees) return specStatus
  return cleanup ? `≠ ${specStatus} → ${cleanup}` : `≠ ${specStatus}`
}

module.exports = { expandStateArgs, specColumn, specCell, boardDisagreement }
