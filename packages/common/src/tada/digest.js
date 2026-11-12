'use strict'

/**
 * The ta-da digest: the window's sessions, folded into the repo each one
 * worked in and grouped by branch. This is what `skitterspec tada` prints and
 * what the skill writes its recap from — never the transcripts themselves.
 *
 * The project is the REPO, not the cwd. A session that `cd`s into
 * `../<repo>-wt/<slug>` is still working on `<repo>`, and grouping by cwd
 * reported one repo as one project per worktree (Decision 3).
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { listTranscripts, readSession, trimPrompts } = require('./transcripts.js')

/**
 * The repo a cwd belongs to, through the shared git dir — which every worktree
 * of a repo points at, so they all fold into the primary checkout.
 *
 * @returns {{ repo: string } | { repo: null } | { missing: true }}
 *   `repo: null` is a directory that exists outside any repo; `missing` is one
 *   that no longer exists (a torn-down worktree), and is not the same fact.
 */
function gitRepoOf(cwd) {
  if (!fs.existsSync(cwd)) return { missing: true }
  let common
  try {
    common = execFileSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return { repo: null }
  }
  return { repo: path.basename(common) === '.git' ? path.dirname(common) : common }
}

function memo(fn) {
  const seen = new Map()
  return (k) => {
    if (!seen.has(k)) seen.set(k, fn(k))
    return seen.get(k)
  }
}

/**
 * @param {object} a
 *   - `root`    the transcripts root (`defaultRoot()`)
 *   - `window`  `{ since, until }` from `windowFor`
 *   - `here`    a cwd to narrow to its repo, or null for every project
 *   - `repoOf`  `gitRepoOf`, injectable
 */
async function buildDigest({ root, window, here = null, repoOf = gitRepoOf }) {
  const resolve = memo(repoOf)
  const notes = []
  const refolded = new Set()
  const files = listTranscripts(root, window.since)
  const projects = new Map()
  let stamped = 0

  for (const file of files) {
    const session = await readSession(file, window)
    stamped += session.stamped
    // A cwd that is gone takes the repo of a place in the same session that
    // still resolves, else of the directory the session was launched from —
    // it started somewhere real before it moved.
    const fallback =
      session.places.map((p) => resolve(p.cwd)).find((r) => r.repo) ||
      (session.launch && [resolve(session.launch)].find((r) => r.repo))

    for (const place of session.places) {
      let r = resolve(place.cwd)
      if (r.missing) {
        // The usual reason is a worktree torn down by /spec-complete — the
        // normal end of a spec — so these are counted, not listed one by one.
        if (fallback) {
          refolded.add(place.cwd)
          r = fallback
        } else {
          notes.push(`cannot tell: ${place.cwd} no longer exists, and nothing in its session does`)
          r = { repo: null }
        }
      }
      const key = r.repo || place.cwd
      if (!projects.has(key)) {
        projects.set(key, { key, repo: r.repo, name: path.basename(key), git: Boolean(r.repo), groups: new Map() })
      }
      const groups = projects.get(key).groups
      const branch = place.branch || null
      if (!groups.has(branch)) groups.set(branch, new Map())
      const sessions = groups.get(branch)
      if (!sessions.has(session.id)) sessions.set(session.id, { id: session.id, start: place.start, end: place.end, prompts: [] })
      const s = sessions.get(session.id)
      if (place.start < s.start) s.start = place.start
      if (place.end > s.end) s.end = place.end
      s.prompts.push(...place.prompts)
    }
  }

  if (refolded.size > 0) {
    notes.push(
      `${refolded.size} working director${refolded.size === 1 ? 'y' : 'ies'} no longer exist ` +
        "(torn-down worktrees, usually) — counted under the repo their session started in, on the branch it recorded",
    )
  }

  // The positive signal behind an empty day: transcripts changed inside the
  // window, yet not one entry in any of them carried a timestamp we could read.
  // That is a format we no longer understand, not a day off.
  if (files.length > 0 && stamped === 0) {
    notes.push(
      `cannot tell: ${files.length} transcript(s) changed in the window but none carried a readable ` +
        'timestamp — the transcript format may have changed',
    )
  }

  let list = [...projects.values()]
  if (here) {
    const at = path.resolve(here)
    const key = resolve(at).repo || at
    list = list.filter((p) => p.key === key)
  }

  return {
    window: { since: window.since.toISOString(), until: window.until.toISOString() },
    projects: list
      .map((p) => ({
        repo: p.repo,
        name: p.name,
        git: p.git,
        groups: [...p.groups.entries()]
          .map(([branch, sessions]) => ({
            branch,
            sessions: [...sessions.values()]
              .map((s) => {
                s.prompts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
                return { id: s.id, start: s.start, end: s.end, ...trimPrompts(s.prompts) }
              })
              .sort((a, b) => (a.start < b.start ? -1 : 1)),
          }))
          .sort((a, b) => (a.sessions[0].start < b.sessions[0].start ? -1 : 1)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    notes: [...new Set(notes)],
  }
}

module.exports = { buildDigest, gitRepoOf }
