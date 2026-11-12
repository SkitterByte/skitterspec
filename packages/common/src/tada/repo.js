'use strict'

/**
 * Everything a ta-da list knows about one repo beyond its sessions: the
 * author's commits in the window attributed to specs, the lifecycle moves
 * those commits made, and how to read a branch or a ticket back to a spec.
 *
 * `git` is the injected reader (`(args) => stdout | null`) and `config` the
 * repo's loaded env config, so this runs against a throwaway repo in tests.
 */

const fs = require('node:fs')
const path = require('node:path')

const { describeBaseBranch } = require('../env/resolve.js')
const { CONTAINS_CAP, authorOf, branchesContaining, knownSpecs, onBaseIn, readCommits, specForTicket, ticketFor } = require('./commits.js')
const { attributeCommit, branchToSpec, lifecycleEvents } = require('./specs.js')

// Enough to tell commits apart in a recap, as `git log --oneline` does.
const SHORT = 9

/**
 * @param {object} a
 *   - `repo`    the repo root
 *   - `git`     reader bound to it
 *   - `config`  its env config (`loadEnvConfig(repo).config`)
 *   - `window`  `{ since, until }`
 * @returns {{ skitterspec, base, toSpec, ticket, commits, events, notes }}
 */
function readRepoFacts({ repo, git, config, window }) {
  const notes = []
  // The positive signal for a skitterspec project: the config folder `init`
  // always writes. A lifecycle folder is not checked — git drops an empty one.
  const skitterspec = fs.existsSync(path.join(repo, 'specs', '.core'))

  let base = null
  try {
    base = describeBaseBranch(config, git).base
  } catch {
    base = null
  }
  const heads = (git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']) || '').split('\n').filter(Boolean)
  // The base first, so its copy of a spec is the one read unless only a
  // spec branch has it.
  const refs = [...new Set([base, ...heads].filter(Boolean))]
  const known = skitterspec ? knownSpecs(git, refs) : []
  const toSpec = skitterspec ? branchToSpec(config.branch && config.branch.pattern, known) : () => null
  const identifierField = (config.branch && config.branch.identifierField) || null

  const ticketCache = new Map()
  const ticket = (spec) => {
    if (!ticketCache.has(spec)) ticketCache.set(spec, skitterspec ? ticketFor(git, refs, spec, identifierField) : null)
    return ticketCache.get(spec)
  }
  const specOfTicket = (id) => (skitterspec ? specForTicket(git, refs, id) : null)

  const span = { since: window.since.toISOString(), until: window.until.toISOString() }
  const author = authorOf(git)
  let raw = []
  if (!author) {
    notes.push(`cannot tell: ${path.basename(repo)} has no user.email or user.name, so its commits were not read`)
  } else {
    raw = readCommits(git, { ...span, author: author.match })
    if (raw === null) {
      notes.push(`cannot tell: git log failed in ${repo}`)
      raw = []
    }
  }

  const show = (ref, p) => git(['show', `${ref}:${p}`])
  const onBase = onBaseIn(git, base, span)
  const commits = []
  const events = []
  let asked = 0
  // `git log` is newest first, and a rebase stamps a run of commits with one
  // committer second — so walk oldest first, and equal times keep that order.
  raw.slice().reverse().forEach((c) => {
    const landed = onBase.has(c.sha)
    // Only an unlanded commit's branches say anything (`attributeCommit`), so
    // only those are asked — and only up to the cap.
    const branches = !landed && asked++ < CONTAINS_CAP ? branchesContaining(git, c.sha) : []
    const spec = skitterspec ? attributeCommit({ ...c, onBase: landed, branches }, toSpec, specOfTicket) : null
    // Where a commit with no spec is reported: the base branch when it is
    // there, else the first branch holding it.
    const branch = landed ? base : branches[0] || null
    commits.push({ sha: c.sha.slice(0, SHORT), at: c.at, subject: c.subject, spec, branch, refs: c.refs })
    if (skitterspec) {
      for (const e of lifecycleEvents(c, show)) events.push({ ...e, sha: c.sha.slice(0, SHORT), at: c.at })
    }
  })
  if (asked > CONTAINS_CAP) {
    notes.push(`${asked} unlanded commits in ${path.basename(repo)} — past ${CONTAINS_CAP}, the rest are attributed by their files alone`)
  }

  return { skitterspec, base, toSpec, ticket, commits, events, notes }
}

module.exports = { readRepoFacts }
