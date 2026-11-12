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
 *   - `facts`   `(repo) => readRepoFacts(…)` — commits, lifecycle moves and
 *               spec lookups for a repo; omitted, groups are sessions only
 *   - `openFor` `(repo) => [{ spec, detail, next }]` — what is in flight there
 *   - `category` the running project's category: only projects carrying the
 *               same one are reported. Null reports every project.
 */
async function buildDigest({ root, window, here = null, repoOf = gitRepoOf, facts = null, openFor = null, category = null }) {
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

  const want = category ? fold(category) : null
  const reported = list
    .map((p) => ({ p, f: p.repo && facts ? facts(p.repo) : null }))
    // Scoped by category: a project counts only when its own config carries
    // the same one. Uncategorised projects — and repos with no skitterspec
    // config, which have nowhere to declare one — are left out entirely.
    .filter(({ f }) => !want || (f && f.category && fold(f.category) === want))
    .map(({ p, f }) => {
      if (f) notes.push(...f.notes)
      return {
        repo: p.repo,
        name: (f && f.name) || p.name,
        ...(f && f.category ? { category: f.category } : {}),
        git: p.git,
        skitterspec: Boolean(f && f.skitterspec),
        groups: groupsOf(p, f, f && openFor ? openFor(p.repo) : []),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    window: { since: window.since.toISOString(), until: window.until.toISOString() },
    ...(category ? { category } : {}),
    projects: reported,
    notes: [...new Set(notes)],
  }
}

const fold = (s) => s.trim().toLowerCase()

/**
 * One project's groups: a spec where the branch, a commit or an in-flight row
 * names one, else the branch. Sessions, commits, lifecycle moves and open
 * state for one spec land in one group, whichever of them found it.
 */
function groupsOf(p, f, open) {
  const groups = new Map()
  const group = (spec, branch) => {
    const key = spec ? `spec\0${spec}` : `branch\0${branch || ''}`
    if (!groups.has(key)) {
      groups.set(key, { spec: spec || null, branch: branch || null, sessions: [], commits: [], events: [], inFlight: null })
    }
    const g = groups.get(key)
    if (!g.branch && branch) g.branch = branch
    return g
  }

  for (const [branch, sessions] of p.groups) {
    const g = group(f ? f.toSpec(branch) : null, branch)
    for (const s of sessions.values()) {
      s.prompts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      g.sessions.push({ id: s.id, start: s.start, end: s.end, ...trimPrompts(s.prompts) })
    }
  }
  if (f) {
    for (const c of f.commits) group(c.spec, c.spec ? null : c.branch).commits.push(c)
    for (const e of f.events) group(e.spec, null).events.push(e)
  }
  for (const row of open) group(row.spec, null).inFlight = row

  return [...groups.values()]
    .map((g) => {
      g.sessions.sort((a, b) => (a.start < b.start ? -1 : 1))
      g.commits.sort(byTime)
      g.events.sort(byTime)
      const ticket = g.spec && f ? f.ticket(g.spec) || refTicket(g.commits) : null
      return { spec: g.spec, branch: g.branch, ...(ticket ? { ticket } : {}), sessions: g.sessions, commits: g.commits, events: g.events, inFlight: g.inFlight }
    })
    .sort((a, b) => {
      // Activity first, in the order it happened; a spec that is only open —
      // in flight, untouched in this window — goes last.
      const ta = firstAt(a)
      const tb = firstAt(b)
      if (ta === tb) return 0
      if (ta === null) return 1
      if (tb === null) return -1
      return ta < tb ? -1 : 1
    })
}

// Stable on a tie — a rebased run shares one committer second, and its order
// is the walk's, which is oldest first.
function byTime(a, b) {
  const ta = Date.parse(a.at)
  const tb = Date.parse(b.at)
  return ta < tb ? -1 : ta > tb ? 1 : 0
}

function firstAt(g) {
  const times = [...g.sessions.map((s) => s.start), ...g.commits.map((c) => c.at)].map((t) => Date.parse(t))
  return times.length ? Math.min(...times) : null
}

// A spec whose overview carries no ticket can still be named by the `Refs:`
// its commits carried — the id alone, since only the overview holds a url.
function refTicket(commits) {
  const ids = [...new Set(commits.flatMap((c) => c.refs || []))]
  return ids.length === 1 ? { id: ids[0], url: null } : null
}

module.exports = { buildDigest, gitRepoOf }
