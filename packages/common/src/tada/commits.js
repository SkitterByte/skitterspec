'use strict'

/**
 * A repo's side of the ta-da list: the author's commits in the window, which
 * branches hold each one, and the tickets its specs carry. Every git call
 * goes through an injected reader — `(args) => stdout | null` — so this is
 * testable against a throwaway repo and never shells out on its own.
 */

const { readTicket } = require('../env/resolve.js')
const { BUCKETS } = require('./specs.js')

const RS = '\x1e'
const US = '\x1f'

// Past this many commits in one window the per-commit branch lookup is the
// slow half; the commits are still listed, attributed by their files alone.
const CONTAINS_CAP = 200

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Who "you" are in this repo: its own `user.email`, else `user.name`. Read per
 * repo because a work repo and a personal one often carry different
 * identities. Null is cannot-tell — the caller says so rather than reporting
 * a day with no commits.
 */
function authorOf(git) {
  const email = git(['config', 'user.email'])
  if (email) return { match: escapeRegex(email), who: email }
  const name = git(['config', 'user.name'])
  if (name) return { match: escapeRegex(name), who: name }
  return null
}

/**
 * The author's non-merge commits in the window, on any ref, each with the
 * files it touched and its `Refs:` trailers.
 *
 * @returns {Array<{ sha, at, subject, refs: string[], files }>|null}
 *   null when git could not be read at all
 */
function readCommits(git, { since, until, author }) {
  const out = git([
    'log',
    // Every ref but the stash: a stash entry is a commit too, and `--all`
    // reports it as work ("index on feat/x: …") done twice.
    '--exclude=refs/stash',
    '--all',
    '--no-merges',
    `--since=${since}`,
    `--until=${until}`,
    `--author=${author}`,
    '--name-status',
    '-M',
    `--format=${RS}%H${US}%cI${US}%s${US}%(trailers:key=Refs,valueonly,separator=%x2c)`,
  ])
  if (out === null) return null
  const commits = []
  for (const record of out.split(RS)) {
    if (!record.trim()) continue
    const [head, ...rest] = record.split('\n')
    const [sha, at, subject, refs] = head.split(US)
    const files = []
    for (const line of rest) {
      if (!line.trim()) continue
      const [status, a, b] = line.split('\t')
      // `R087` — a rename with its similarity score; the letter is the fact.
      if (status[0] === 'R' && b) files.push({ status: 'R', from: a, path: b })
      else if (a) files.push({ status: status[0], path: a })
    }
    commits.push({
      sha,
      at,
      subject,
      refs: (refs || '').split(',').map((r) => r.trim()).filter(Boolean),
      files,
    })
  }
  return commits
}

/** The shas the base branch holds in the window — one walk, not one per commit. */
function onBaseIn(git, base, { since, until }) {
  if (!base) return new Set()
  const out = git(['log', base, '--no-merges', `--since=${since}`, `--until=${until}`, '--format=%H'])
  return new Set(out ? out.split('\n').filter(Boolean) : [])
}

/** The local branches that hold a commit — most recent first is not promised. */
function branchesContaining(git, sha) {
  const out = git(['for-each-ref', '--contains', sha, '--format=%(refname:short)', 'refs/heads'])
  return out ? out.split('\n').filter(Boolean) : []
}

/**
 * Every spec folder this repo can see across `refs` — the base branch and the
 * spec branches, since under `land.specDocs: "branch"` a spec exists only on
 * its own. One `ls-tree` per ref; nothing is read until it is asked for.
 */
function knownSpecs(git, refs) {
  const known = new Set()
  for (const ref of refs) {
    const listing = git(['ls-tree', '-r', '--name-only', ref, '--', ...BUCKETS.map((b) => `specs/${b}`)])
    if (!listing) continue
    for (const p of listing.split('\n')) {
      const m = /^specs\/[^/]+\/([^/]+)\/00-overview\.md$/.exec(p)
      if (m) known.add(m[1])
    }
  }
  return [...known]
}

/** A spec's ticket, read off the first of `refs` that holds its overview. */
function ticketFor(git, refs, spec, identifierField = null) {
  for (const ref of refs) {
    for (const bucket of BUCKETS) {
      const text = git(['show', `${ref}:specs/${bucket}/${spec}/00-overview.md`])
      if (text === null) continue
      return readTicket(text, identifierField)
    }
  }
  return null
}

/**
 * The spec a `Refs:` ticket names, found by the identifier stamped in its
 * overview. Exactly one match or null — two specs claiming one ticket is a
 * question, not an answer.
 */
function specForTicket(git, refs, id) {
  const value = escapeRegex(id)
  const names = new Set()
  for (const ref of refs) {
    const out = git(['grep', '-l', '-E', `^[A-Za-z][A-Za-z0-9]*_identifier:[[:space:]]*["']?${value}["']?[[:space:]]*$`, ref, '--', 'specs/*/*/00-overview.md'])
    if (!out) continue
    for (const line of out.split('\n')) {
      const m = /specs\/[^/]+\/([^/]+)\/00-overview\.md$/.exec(line)
      if (m) names.add(m[1])
    }
  }
  return names.size === 1 ? [...names][0] : null
}

module.exports = { CONTAINS_CAP, authorOf, branchesContaining, knownSpecs, onBaseIn, readCommits, specForTicket, ticketFor }
