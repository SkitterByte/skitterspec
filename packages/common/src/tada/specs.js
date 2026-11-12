'use strict'

/**
 * Turning git facts into spec facts for a ta-da list: which spec a branch
 * belongs to, which lifecycle moves a commit made, and which spec a commit on
 * the base branch was about. Pure — every input arrives already read.
 */

const { splitPrefix, phaseIsDone } = require('../env/resolve.js')

const TYPES = 'feat|bug|hotfix|chore|issue|incident|epic'
const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']

// A spec document's path, anywhere in the repo — a project may sit in a
// subfolder, so the `specs/` segment is matched rather than anchored.
const SPEC_PATH = new RegExp(`(?:^|/)specs/(${BUCKETS.join('|')})/([^/]+)/([^/]+)$`)

function specPath(p) {
  const m = SPEC_PATH.exec(p)
  return m ? { bucket: m[1], name: m[2], file: m[3] } : null
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A branch name → the spec it was provisioned for, read back through the
 * project's `branch.pattern`. `{type}` and `{slug}` give the name outright;
 * a pattern without `{type}` names a slug, which only counts when exactly one
 * known spec carries it — two would make the answer a guess.
 *
 * @param {string} pattern  `branch.pattern`, e.g. `{type}/{slug}`
 * @param {string[]} known  spec folder names this repo can see
 * @returns {(branch: string) => string|null}
 */
function branchToSpec(pattern, known = []) {
  const p = pattern || '{type}/{slug}'
  if (!p.includes('{slug}')) return () => null
  const shape = (slug) =>
    new RegExp(
      `^${escape(p).replace(/\\\{(type|slug|identifier)\\\}/g, (_, token) => {
        if (token === 'type') return `(?<type>${TYPES})`
        if (token === 'identifier') return '[^/]+'
        return slug === null ? '(?<slug>.+)' : escape(slug)
      })}$`,
    )
  if (p.includes('{type}')) {
    const re = shape(null)
    return (branch) => {
      const m = branch && re.exec(branch)
      return m ? `${m.groups.type}-${m.groups.slug}` : null
    }
  }
  // No `{type}`: where `{slug}` ends is ambiguous beside an `{identifier}`
  // (`ABC-12-orders`), so each known spec's slug is tried as a literal.
  const shapes = known.map((k) => [k, shape(splitPrefix(k).slug)])
  return (branch) => {
    if (!branch) return null
    const hits = shapes.filter(([, re]) => re.test(branch)).map(([k]) => k)
    return hits.length === 1 ? hits[0] : null
  }
}

/**
 * The lifecycle moves one commit made, from its `--name-status` lines and,
 * for a phase, the file's text either side of it.
 *
 * @param {object} commit  `{ sha, files: [{ status, path, from? }] }`
 * @param {(ref: string, path: string) => string|null} show  `git show ref:path`
 * @returns {Array<{ spec, kind, phase? }>}
 *   kind: written · started · completed · cancelled · phase-done
 */
function lifecycleEvents(commit, show) {
  const events = []
  const seen = new Set()
  const add = (spec, kind, extra = {}) => {
    const key = `${spec}\0${kind}\0${extra.phase || ''}`
    if (seen.has(key)) return
    seen.add(key)
    events.push({ spec, kind, ...extra })
  }
  for (const f of commit.files) {
    const to = specPath(f.path)
    if (!to) continue
    if (f.status === 'R' && f.from) {
      const from = specPath(f.from)
      if (from && from.name === to.name && from.bucket !== to.bucket) {
        if (to.bucket === 'in-progress') add(to.name, 'started')
        else if (to.bucket === 'complete') add(to.name, 'completed')
        else if (to.bucket === 'cancelled') add(to.name, 'cancelled')
      }
      continue
    }
    // `/spec` writes into backlog; `/spec-bug` and its kin write straight into
    // in-progress, so a new overview in either is a spec being written.
    if (f.status === 'A' && to.file === '00-overview.md' && (to.bucket === 'backlog' || to.bucket === 'in-progress')) {
      add(to.name, 'written')
      continue
    }
    const phase = /^(\d+)-.+\.md$/.exec(to.file)
    if (f.status === 'M' && phase && Number(phase[1]) > 0) {
      const after = show(commit.sha, f.path)
      const before = show(`${commit.sha}^`, f.path)
      // Both sides must be read: a phase file git could not show either side
      // of is cannot-tell, never a phase someone finished.
      if (after !== null && before !== null && phaseIsDone(after) && !phaseIsDone(before)) {
        add(to.name, 'phase-done', { phase: Number(phase[1]) })
      }
    }
  }
  return events
}

/** The one spec a commit's documents belong to, or null when none or several. */
function specTouched(commit) {
  const names = new Set(commit.files.map((f) => specPath(f.path)).filter(Boolean).map((s) => s.name))
  return names.size === 1 ? [...names][0] : null
}

/**
 * Which spec a commit belongs to: a branch that maps to a spec, then the one
 * spec folder it touched, then its `Refs:` ticket. Anything else is `null` —
 * reported under its branch as no spec.
 *
 * THE BRANCH IS ASKED ONLY OF A COMMIT NOT YET ON THE BASE. Containment is
 * not authorship: a spec branch forked this afternoon contains every commit
 * the base had this morning, so asking it about a landed commit attributes the
 * whole day to whichever spec was started last. A landed commit is answered by
 * what it carries — its files and its trailer — which do not move.
 *
 * @param {object} commit      `{ onBase, branches, files, refs }`
 * @param {(b: string) => string|null} toSpec
 * @param {(id: string) => string|null} specOfTicket  ticket id → spec, asked
 *   only when nothing else answered, since it is the one lookup that searches
 */
function attributeCommit(commit, toSpec, specOfTicket) {
  const touched = specTouched(commit)
  if (!commit.onBase) {
    const fromBranch = commit.branches.map(toSpec).filter(Boolean)
    if (fromBranch.length) return touched && fromBranch.includes(touched) ? touched : fromBranch[0]
  }
  if (touched) return touched
  const tickets = [...new Set(commit.refs.map(specOfTicket).filter(Boolean))]
  return tickets.length === 1 ? tickets[0] : null
}

module.exports = { BUCKETS, attributeCommit, branchToSpec, lifecycleEvents, specPath, specTouched }
