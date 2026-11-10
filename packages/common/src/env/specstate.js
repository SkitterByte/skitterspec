'use strict'

/**
 * What a spec's own copy says about it — the reader behind `skitterspec status`.
 *
 * Point it at a worktree (or any checkout) and a spec folder name, and it reports
 * the bucket the spec sits in THERE, its phase progress, and any `Status:` /
 * `Developer:` header it still carries. Pure but for the injected `io`, so the
 * command layer is testable without a worktree and this without a CLI.
 *
 * THE BUCKET IS READ FROM THE ROOT IT IS GIVEN. On the base branch an in-flight
 * spec still sits in `backlog/`, which is the very lie this exists to correct, so
 * the caller hands it the worktree's root, never the checkout it is standing in.
 *
 * A MISSING `Status:` HEADER IS NOT UNKNOWN. Under `sync.fieldOwnership`
 * `workflowState: "pull"` new specs carry no `Status:` or `Developer:` line —
 * the board owns both — so `status: null` is the expected shape, and the bucket
 * and progress still answer. Only a spec that cannot be found or read is
 * `found: false`, and the caller renders that as `status unknown` rather than
 * dropping it (Decision 5).
 */

const fs = require('node:fs')
const path = require('node:path')

const { phaseProgress } = require('./phases.js')
const { isEpic } = require('./resolve.js')

// Most live first: a spec that exists in two buckets mid-`git mv` is reported
// where it is going, not where it was.
const SEARCH = ['in-progress', 'backlog', 'complete', 'cancelled']

const defaultIo = {
  readdir: (dir) => fs.readdirSync(dir),
  readFile: (file) => fs.readFileSync(file, 'utf8'),
}

// A header line's value, or null when the line is absent, empty, or the `—`
// placeholder the templates write before anyone is named.
function header(text, field) {
  const m = new RegExp(`^>\\s*\\*\\*${field}:\\*\\*[ \\t]*(.*)$`, 'm').exec(text)
  if (!m) return null
  const value = m[1].trim()
  return value && value !== '—' && value !== '-' ? value : null
}

// Inline phases, for the legacy overview with no phase files: `## Phase N …`
// headings carrying the same emoji the phase files do. Nothing countable is
// null, never zero — "no phases" and "could not see the phases" differ.
function inlineProgress(text) {
  const headings = text.split('\n').filter((l) => /^#{2,3}\s+Phase\s+\d+\b/.test(l))
  if (!headings.length) return null
  return phaseProgress(headings.map((h) => ({ content: h.replace(/^#+/, '#') })))
}

function tryRead(io, fn) {
  try {
    return fn()
  } catch {
    return null
  }
}

/**
 * @param {string} root    the checkout to read — a spec's worktree, normally
 * @param {string} folder  the spec's folder name (`feat-x`)
 * @param {object} [io]    `{ readdir, readFile }`, each throwing on failure
 * @returns {{ found: true, bucket, legacy, phasesDone, phasesTotal, currentPhase, status, developer }
 *         | { found: false, reason }}
 */
function readSpecState(root, folder, io = defaultIo) {
  for (const bucket of SEARCH) {
    const dir = path.join(root, 'specs', bucket, folder)
    const files = tryRead(io, () => io.readdir(dir))
    if (files) {
      const overview = tryRead(io, () => io.readFile(path.join(dir, '00-overview.md')))
      if (overview === null) return { found: false, reason: `${bucket}/${folder} has no readable 00-overview.md` }
      const phaseFiles = files.filter((f) => /^(?!00-)\d{2}-.*\.md$/.test(f)).sort()
      const phases = phaseFiles.map((f) => ({ file: f, content: tryRead(io, () => io.readFile(path.join(dir, f))) }))
      // An epic has no phases by construction (its prefix says so), so zero is
      // an answer for it — where any other folder without phase files is a
      // legacy overview to read inline.
      const progress = phases.length || isEpic(folder) ? phaseProgress(phases) : inlineProgress(overview)
      return state(bucket, false, overview, progress)
    }
    const bare = tryRead(io, () => io.readFile(path.join(root, 'specs', bucket, `${folder}.md`)))
    if (bare !== null) return state(bucket, true, bare, inlineProgress(bare))
  }
  return { found: false, reason: `no spec named ${folder} under specs/` }
}

function state(bucket, legacy, text, progress) {
  return {
    found: true,
    bucket,
    legacy,
    phasesDone: progress ? progress.done : null,
    phasesTotal: progress ? progress.total : null,
    currentPhase: progress ? progress.current : null,
    status: header(text, 'Status'),
    developer: header(text, 'Developer'),
  }
}

module.exports = { readSpecState, SEARCH }
