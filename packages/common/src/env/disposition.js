'use strict'

/**
 * Disposition enumeration for `spec-env disposition` — the input to
 * /spec-complete's PR-mode guard.
 *
 * Once a PR is ready, anyone can merge from the host's UI and the tracker
 * closes the ticket, so readying it is the last moment skitterspec is
 * guaranteed to be standing there. Before that happens, every loose end is
 * ENUMERATED here and DISPOSED by the operator in the skill (tick with
 * evidence · spin off as a linked ticket · drop with a recorded reason).
 * Enumeration is automatic; deciding is human — the same split the review
 * marks use, and like them this is information: nothing here refuses, counts
 * toward a gate, or exits non-zero.
 *
 * Pure: the caller reads the files and hands them over, so every shape is
 * unit-testable with no filesystem.
 *
 * @param {object} input { overview, phases: [{ file, content }] }
 * @returns {object} { tasks, phases, followUps, clean }
 *   tasks     — unticked `- [ ]` items, per phase file, with line numbers
 *   phases    — phase-index rows whose status is not ✅
 *   followUps — Changelog `Follow-up surfaced:` lines (all of them: whether a
 *               spec was later written for one is not knowable from this file,
 *               so the operator reads the list rather than trusting a guess)
 *   clean     — nothing enumerated; the guard has nothing to ask about
 */
function collectDisposition(input) {
  const overview = (input && input.overview) || ''
  const phaseFiles = (input && Array.isArray(input.phases)) ? input.phases : []

  const tasks = []
  for (const { file, content } of phaseFiles) {
    const lines = String(content || '').split('\n')
    lines.forEach((line, i) => {
      const m = line.match(/^\s*- \[ \] (.+)$/)
      if (m) tasks.push({ file, line: i + 1, text: m[1].trim() })
    })
  }

  // Phase-index rows: | <n> | <title> | <status> | [<file>](<file>) | — only
  // rows whose status cell is not ✅. The index is the overview's summary of
  // the phase files, so a row here and no unticked tasks usually means the
  // index lagged; both are listed and the operator reconciles.
  const phases = []
  for (const line of overview.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*([^|]+?)\s*\|\s*\[([^\]]+)\]/)
    if (m && !m[3].includes('✅')) {
      phases.push({ n: Number(m[1]), title: m[2], status: m[3].trim(), file: m[4] })
    }
  }

  const followUps = []
  for (const line of overview.split('\n')) {
    const m = line.match(/Follow-up surfaced:\s*(.+)$/)
    if (m) followUps.push({ text: m[1].trim() })
  }

  return { tasks, phases, followUps, clean: !tasks.length && !phases.length && !followUps.length }
}

module.exports = { collectDisposition }
