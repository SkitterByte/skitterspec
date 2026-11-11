'use strict'

/**
 * The disk half of an epic's answer, shared by the CLI (`skitterspec epic
 * status`) and the review server's epic page (spec feat-epic-next, Decision 5),
 * so a page and a terminal opened side by side cannot read the same epic two
 * ways.
 *
 * Waits are read off the BASE BRANCH by git, never off whatever the primary
 * checkout has checked out; each member's progress and review state off its
 * OWN worktree, where they are true (`env/epic.js`).
 */

const fs = require('node:fs')
const path = require('node:path')

const { isEpic } = require('./resolve.js')
const { epicStatus, epicHeaders, indexSpecTree } = require('./epic.js')
const { epicRows, readNextInputs } = require('./nextaction.js')
const { reviewOutPath } = require('./review.js')

/**
 * The base branch's spec tree: `{ index, readFile, candidates }`, or null when
 * the branch cannot be read — cannot-tell, never an empty plan.
 */
function epicTree(git, base) {
  const listing = git(['ls-tree', '-r', '--name-only', base, '--', 'specs'])
  if (listing === null) return null
  // `git grep` exits 1 on no match, which the reader returns as null. The tree
  // above was readable, so here null is "no spec names an epic".
  const grep = git(['grep', '-l', '-E', '^>[[:space:]]*\\*\\*Epic:\\*\\*', base, '--', 'specs'])
  const candidates = (grep || '')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(base.length + 1))
  return { index: indexSpecTree(listing), readFile: (p) => git(['show', `${base}:${p}`]), candidates }
}

/**
 * The same shape as `epicTree`, read off a WORKING TREE on disk — uncommitted
 * edits included. It is what `epic status --here` reads members and headers
 * from, so a conversion can be checked in the worktree it is made in before it
 * lands. Waits are still met only on the base branch: that is the caller's
 * `waitIndex`, never this.
 *
 * WHAT WOULD FOOL THIS: a file git would ignore is read like any other. Under
 * `specs/` there is nothing ignored by design, so the cost is a stray editor
 * backup named `*.md`, read as one more phase file.
 */
function workingTree(root) {
  const files = []
  const walk = (rel) => {
    let entries
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = `${rel}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) files.push(p)
    }
  }
  walk('specs')
  const readFile = (p) => {
    try {
      return fs.readFileSync(path.join(root, p), 'utf8')
    } catch {
      return null
    }
  }
  const candidates = files.filter((p) => p.endsWith('/00-overview.md') && /^>\s*\*\*Epic:\*\*/m.test(readFile(p) || ''))
  return { index: indexSpecTree(files.join('\n')), readFile, candidates }
}

// A provisioned spec's own overview and bucket, read in its worktree — the
// copy where an in-flight spec's bucket and headers are true. null when the
// worktree holds no readable copy.
function worktreeOverview(root, folder) {
  for (const bucket of ['in-progress', 'backlog', 'complete', 'cancelled']) {
    const dir = path.join(root, 'specs', bucket, folder)
    let overview
    try {
      overview = fs.readFileSync(path.join(dir, '00-overview.md'), 'utf8')
    } catch {
      continue
    }
    const phases = fs
      .readdirSync(dir)
      .filter((f) => /^\d\d-.+\.md$/.test(f) && f !== '00-overview.md')
      .map((f) => {
        let text = null
        try {
          text = fs.readFileSync(path.join(dir, f), 'utf8')
        } catch {
          // unreadable: a phase with nothing to say
        }
        return { n: Number(f.slice(0, 2)), text }
      })
    return { folder, bucket, overview, phases, root }
  }
  return null
}

// Epics with a member, or themselves, in flight on this machine — what a bare
// `epic status` offers when it cannot tell which one was meant, and what the
// review server's index lists.
function epicsInFlight(worktrees) {
  const open = worktrees.filter((w) => w.bucket !== 'complete' && w.bucket !== 'cancelled')
  const names = open.map((w) => (isEpic(w.folder) ? w.folder : epicHeaders(w.overview).epic)).filter(Boolean)
  return [...new Set(names)].sort()
}

/**
 * The callbacks `epicRows` reads each member through: its own worktree, the
 * review sidecars beside its page in the primary checkout, and a link to that
 * page from `linkFor` — absolute for a terminal, relative for the served page.
 */
function memberReaders({ dir, config, worktrees, linkFor = () => null, git }) {
  const own = new Map(worktrees.map((w) => [w.folder, w]))
  return {
    inputsFor: (spec) => {
      const w = own.get(spec)
      if (!w) return null
      return readNextInputs({
        folder: spec,
        bucket: w.bucket,
        worktree: w.root,
        outPath: reviewOutPath(dir, spec),
        required: config ? config.review.required : true,
        git: git(w.root),
      })
    },
    tabFor: (spec) => (own.has(spec) ? path.relative(path.dirname(dir), own.get(spec).root) : null),
    linkFor,
  }
}

/** The whole answer for one epic: `epicStatus` plus a row per member. */
function epicAnswer(epic, inputs, readers) {
  const status = epicStatus({ epic, ...inputs })
  const { rows, next } = epicRows(status, readers)
  return { ...status, rows, next }
}

module.exports = { epicTree, workingTree, worktreeOverview, epicsInFlight, memberReaders, epicAnswer }
