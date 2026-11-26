'use strict'

/**
 * Phase progress, read off the phase files' H1 emoji — the same emoji the phase
 * index mirrors, and the one `/spec-review` names as authoritative.
 *
 * Shared by `spec-env handoff` (the ticket note) and the spec-state reader
 * behind `skitterspec status`, so the two can never count one spec differently.
 * Pure: each phase arrives as `{ file, content }`.
 */

// How many are ✅, how many there are, and the first 🔄 (where the next owner
// picks up).
//
// A CANCELLED phase (➖) IS EXCLUDED FROM THE TOTAL, and counted on its own: it
// was dropped, not built, so folding it into `done` would overstate the work,
// and leaving it in the total read as "3 of 5" with nothing left to build
// (bug-cancelled-phase-state). `current` stays the phase's position among all
// files, since it names the file a reader opens.
function phaseProgress(phases) {
  const named = (phases || []).filter((p) => p && typeof p.content === 'string')
  const heading = (p) => (p.content.split('\n').find((l) => /^#\s/.test(l)) || '').trim()
  const done = named.filter((p) => heading(p).endsWith('✅')).length
  const cancelled = named.filter((p) => heading(p).endsWith('➖')).length
  const current = named.findIndex((p) => heading(p).endsWith('🔄'))
  return { done, total: named.length - cancelled, current: current === -1 ? null : current + 1, cancelled }
}

function progressText({ done, total, current, cancelled }) {
  if (!total && !cancelled) return 'no phase files'
  let base = `${done} of ${total} phases done`
  if (cancelled) base += `, ${cancelled} cancelled`
  return current ? `${base}, phase ${current} in progress` : base
}

module.exports = { phaseProgress, progressText }
