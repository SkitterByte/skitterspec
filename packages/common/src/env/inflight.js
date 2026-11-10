'use strict'

/**
 * What is in flight here — the rows behind `skitterspec status`, and the detail
 * `spec-env status` prints beside each provisioned spec.
 *
 * Each spec is read in ITS OWN worktree (`readSpecState`), where the bucket and
 * the phase files are truthful, and again in the checkout the command was run
 * from, so the output can say when the two disagree. Offline by construction:
 * nothing here asks a tracker — the board's view is `spec-sync list` and
 * `spec-sync board` (Decision 7).
 *
 * Pure but for the injected reader, so the command layer is testable without a
 * worktree.
 */

const path = require('node:path')

const { readSpecState } = require('./specstate.js')
const { progressText } = require('./phases.js')

/**
 * @param {object} a
 *   - `dir`          the checkout the command was run from
 *   - `provisioned`  `[{ folder, wt, project, specless }]`, from the worktree
 *                    list — `project` is the project folder inside `wt`, the
 *                    same path unless the project sits in a subfolder
 *   - `read`         `readSpecState`, injectable
 */
function collectInFlight({ dir, provisioned, read = readSpecState }) {
  return provisioned.map(({ folder, wt, project, specless }) => {
    const at = project || wt
    // A `/no-spec` record has a branch and no document BY DESIGN (Decision 6).
    // It is listed, and never read, so it can never be called unknown.
    if (specless) return { spec: folder, worktree: at, specless: true }
    const there = read(at, folder)
    const here = read(dir, folder)
    return {
      spec: folder,
      worktree: at,
      specless: false,
      ...there,
      // Where this checkout files it: a bucket, or null when it is not on this
      // branch at all (a spec authored and started without landing here).
      here: here.found ? here.bucket : null,
    }
  })
}

// The one-line detail for a row. Every part is optional except the bucket: a
// `pull`-era spec carries no Status or Developer, and that is the normal shape.
function detailOf(row) {
  if (row.specless) return '(no spec)'
  if (!row.found) return `status unknown — ${row.reason}`
  const parts = [row.bucket]
  if (row.phasesTotal !== null) {
    parts.push(progressText({ done: row.phasesDone, total: row.phasesTotal, current: row.currentPhase }))
  }
  if (row.status) parts.push(row.status)
  if (row.developer) parts.push(row.developer)
  return parts.join(' · ')
}

// Rows whose bucket here differs from the bucket in their own worktree — the
// confusion the closing line explains. A positive signal: both reads found the
// spec and named different buckets, or the worktree found it and this checkout
// does not have it at all. An unreadable worktree copy is never counted.
function disagreeing(rows) {
  return rows.filter((r) => !r.specless && r.found && r.here !== r.bucket)
}

// A worktree outlives its spec when a teardown was declined, so a provisioned
// spec is not necessarily in flight. Finished is the positive signal — the
// worktree's own copy sits in `complete/` or `cancelled/` — and everything else,
// an unreadable copy included, is counted as in flight and still listed.
const FINISHED = new Set(['complete', 'cancelled'])
const isInFlight = (r) => !r.specless && !(r.found && FINISHED.has(r.bucket))

function formatInFlight(rows, { dir }) {
  if (!rows.length) return 'no specs in flight\n'
  const width = Math.max(...rows.map((r) => r.spec.length))
  const live = rows.filter(isInFlight).length
  const out = [live ? `${live} spec${live === 1 ? '' : 's'} in flight` : 'no specs in flight']
  const row = (r, indent) => {
    out.push(`${indent}${r.spec.padEnd(width)}  ${detailOf(r)}`)
    out.push(`${indent}  ${path.relative(dir, r.worktree) || r.worktree}`)
  }
  // Members are listed under their epic, read off each spec's own copy; a spec
  // in no epic — the common case — prints exactly as it always has.
  for (const r of rows.filter((x) => !x.epic)) row(r, '  ')
  const epics = [...new Set(rows.map((r) => r.epic).filter(Boolean))].sort()
  for (const epic of epics) {
    out.push(`  ${epic}`)
    for (const r of rows.filter((x) => x.epic === epic)) row(r, '    ')
  }
  // SAID ONLY WHEN TRUE. On an idle repo, or one whose worktrees all agree with
  // this checkout, the line would explain a discrepancy that is not there.
  const off = disagreeing(rows)
  if (off.length) {
    const n = off.length
    out.push('', `On this branch ${n} of these ${n === 1 ? 'reads' : 'read'} differently — a spec's bucket moves on its own branch.`)
  }
  return out.join('\n') + '\n'
}

module.exports = { collectInFlight, detailOf, disagreeing, formatInFlight, isInFlight }
