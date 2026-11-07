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
function phaseProgress(phases) {
  const named = (phases || []).filter((p) => p && typeof p.content === 'string')
  const heading = (p) => (p.content.split('\n').find((l) => /^#\s/.test(l)) || '').trim()
  const done = named.filter((p) => heading(p).endsWith('✅')).length
  const current = named.findIndex((p) => heading(p).endsWith('🔄'))
  return { done, total: named.length, current: current === -1 ? null : current + 1 }
}

function progressText({ done, total, current }) {
  if (!total) return 'no phase files'
  const base = `${done} of ${total} phases done`
  return current ? `${base}, phase ${current} in progress` : base
}

module.exports = { phaseProgress, progressText }
