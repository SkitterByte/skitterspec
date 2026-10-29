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

// The spec's status beside the board's, and whether they disagree. A board
// state that maps to no bucket never disagrees: it is somewhere push does not
// manage, which is not a claim about the spec. Nor does a row whose spec is not
// on this machine — there is nothing to disagree WITH.
function specColumn(stateName, spec, config) {
  const specStatus = spec ? spec.bucket : null
  const seen = stateName == null ? null : remoteStateReading({ state: { name: stateName } }, config)
  const disagrees = Boolean(specStatus && seen && seen.mapped && seen.bucket !== specStatus)
  return { specStatus, disagrees }
}

// The cell itself: `in-progress`, `≠ backlog` when it disagrees, `—` when the
// spec is not here.
function specCell({ specStatus, disagrees }) {
  if (!specStatus) return '—'
  return disagrees ? `≠ ${specStatus}` : specStatus
}

module.exports = { expandStateArgs, specColumn, specCell }
