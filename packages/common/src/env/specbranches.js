'use strict'

/**
 * Specs that live only on their own branch (feat-tracker-spec-branches).
 *
 * Under `land.specDocs: "branch"` — the default once a ticketing provider is
 * configured — a spec document never lands on the base branch until its work
 * does, so `ls specs/backlog/` on base cannot see it. The checks that read the
 * backlog (`gating check`, `epic status`, `docs-freshness check`) ask this
 * instead, so the specs that mode produces are not invisible to them.
 *
 * What a branch is FOR is read off what it changed: the spec folders its range
 * (`<base>...<ref>`) touches. Every spec branch forks from base and so carries
 * every base spec too; only the ones it changed are its own.
 *
 * Read with git and never fetched. An advisory check that can hang on the
 * network is worse than one that is a fetch behind, so remote-tracking refs are
 * read as they stand and a caller labels them "as of last fetch".
 *
 * WHAT WOULD FOOL THIS: a remote that was never fetched (its specs are simply
 * absent — an extra miss, never an accusation), and a spec branch whose name
 * does not match `branch.pattern` (renamed by hand; it is not found). Every
 * unreadable git call reads as nothing found.
 */

const { BUCKETS } = require('./resolve.js')

const OVERVIEW_RE = /^specs\/([^/]+)\/([^/]+)\/00-overview\.md$/
const SPEC_PATH_RE = /^specs\/([^/]+)\/([^/]+)\//

// `branch.pattern` as a for-each-ref glob: every `{token}` becomes `*`.
function refGlob(config) {
  const pattern = (config && config.branch && config.branch.pattern) || '{type}/{slug}'
  return pattern.replace(/\{[^}]+\}/g, '*')
}

function lines(out) {
  return String(out || '').split('\n').map((l) => l.trim()).filter(Boolean)
}

/**
 * The spec branches this clone can see: local first, then remote-tracking, as
 * `{ ref, name, local }`. The base branch itself is never a spec branch.
 */
function specRefs(git, config, base) {
  const glob = refGlob(config)
  const remote = (config && config.land && config.land.remote) || 'origin'
  const local = lines(git(['for-each-ref', '--format=%(refname)', `refs/heads/${glob}`]))
    .map((ref) => ({ ref, name: ref.slice('refs/heads/'.length), local: true }))
  const prefix = `refs/remotes/${remote}/`
  const tracking = lines(git(['for-each-ref', '--format=%(refname)', `${prefix}${glob}`]))
    .map((ref) => ({ ref, name: ref.slice(prefix.length), local: false }))
  return [...local, ...tracking].filter((r) => r.name !== base && r.name !== 'HEAD')
}

/**
 * Every spec folder a spec branch changed, read off that branch:
 * `[{ folder, bucket, ref, local, overview, phases: [{ n, text }] }]`.
 *
 * Precedence (Decision 7): a folder the base branch has FINISHED — in
 * `complete/` or `cancelled/` — is dropped, since the work is done and a
 * lingering branch is history; otherwise a local branch beats a
 * remote-tracking one. Base's own `backlog/` copy losing to a branch copy is
 * the caller's merge, via `preferBranches`.
 */
function specBranchDocs(git, config, base) {
  if (!base) return []
  const finished = new Set()
  for (const p of lines(git(['ls-tree', '-r', '--name-only', base, '--', 'specs/complete', 'specs/cancelled']))) {
    const m = OVERVIEW_RE.exec(p)
    if (m) finished.add(m[2])
  }
  const found = new Map()
  for (const { ref, local } of specRefs(git, config, base)) {
    const changed = new Set()
    for (const p of lines(git(['diff', '--name-only', `${base}...${ref}`, '--', 'specs']))) {
      const m = SPEC_PATH_RE.exec(p)
      if (m && BUCKETS.includes(m[1])) changed.add(m[2])
    }
    if (!changed.size) continue
    const tree = lines(git(['ls-tree', '-r', '--name-only', ref, '--', 'specs']))
    for (const folder of changed) {
      if (finished.has(folder)) continue
      if (found.has(folder) && (found.get(folder).local || !local)) continue
      const overviewPath = tree.find((p) => {
        const m = OVERVIEW_RE.exec(p)
        return m && m[2] === folder
      })
      if (!overviewPath) continue // the branch deleted it, or moved it out of specs/
      const overview = git(['show', `${ref}:${overviewPath}`])
      if (overview === null) continue
      const bucket = OVERVIEW_RE.exec(overviewPath)[1]
      const dirPrefix = `specs/${bucket}/${folder}/`
      const phases = tree
        .filter((p) => p.startsWith(dirPrefix) && /^\d\d-.+\.md$/.test(p.slice(dirPrefix.length)) && !p.endsWith('/00-overview.md'))
        .map((p) => ({ n: Number(p.slice(dirPrefix.length, dirPrefix.length + 2)), text: git(['show', `${ref}:${p}`]) }))
      found.set(folder, { folder, bucket, ref, local, overview, phases })
    }
  }
  return [...found.values()].sort((a, b) => a.folder.localeCompare(b.folder))
}

/**
 * Merge a disk scan with branch copies: a branch copy replaces the disk entry
 * for the same folder, and adds one where there is none. Both lists carry
 * `folder`; the result keeps the disk entries' order, then the new ones.
 */
function preferBranches(disk, branches) {
  const byFolder = new Map(branches.map((b) => [b.folder, b]))
  const merged = disk.map((d) => byFolder.get(d.folder) || d)
  const seen = new Set(disk.map((d) => d.folder))
  return [...merged, ...branches.filter((b) => !seen.has(b.folder))]
}

/** The label a branch-sourced row carries. */
function branchLabel(entry) {
  return entry.local ? `on ${entry.ref.replace(/^refs\/heads\//, '')}` : `on ${entry.ref.replace(/^refs\/remotes\//, '')}, as of last fetch`
}

module.exports = { specBranchDocs, specRefs, preferBranches, branchLabel, refGlob }
