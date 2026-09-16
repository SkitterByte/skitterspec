'use strict'

/**
 * Pure spec/branch resolution for per-spec isolation.
 *
 * Given a spec argument (a folder name or path) it locates the spec folder under
 * `specs/**`, splits the `feat-`/`bug-` prefix into `{ type, slug }`, derives the
 * git branch from the config's `branch.pattern` (provider-neutral; `{identifier}`
 * is filled from a tracker id when one is configured, else it falls back to
 * `{type}/{slug}`), and expands the config's path/name tokens (`{repo}`,
 * `{repoSlug}`, `{slug}`). Reads files to locate the spec and read frontmatter,
 * but makes no git/docker side effects — deterministic and safe to unit-test with
 * fixtures.
 */

const fs = require('node:fs')
const path = require('node:path')

const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']

// Find the spec folder under specs/<bucket>/<name>. `specArg` may be a bare
// folder name or a path — only its basename is matched against the buckets.
//
// Search order is `preferDirs`, then `dir`, then `extraDirs`:
//   - `preferDirs` is the checkout the CALLER is standing in. A spec's bucket
//     and its `Stack:` / `Base version:` headers are properties of the branch,
//     not of the repo — `/spec-start` moves a spec to `in-progress` on the
//     spec's own branch, so the primary checkout keeps showing `backlog`.
//   - `dir` is the primary checkout, and stays the fallback (and the sole
//     source of repo identity — see `resolveSpec`).
//   - `extraDirs` lets a caller (e.g. `spec-env integrate`) reach a spec that
//     was authored on a branch and never committed to the primary checkout.
function findSpecFolder(specArg, dir, extraDirs = [], preferDirs = []) {
  const name = path.basename(specArg)
  for (const root of [...preferDirs, dir, ...extraDirs]) {
    for (const bucket of BUCKETS) {
      const abs = path.join(root, 'specs', bucket, name)
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        return { folder: name, bucket, path: abs }
      }
    }
  }
  return null
}

/**
 * A spec's phases, as the review page needs them. Never throws.
 *
 * WHAT IT ANSWERS: is there a phase left for `/spec-next` to build? That is the
 * question a `Commit & Continue` button needs, and it is simply `done < total` —
 * `/spec-next` acts on the FIRST UNFINISHED phase, so a spec sitting mid-way
 * through its last phase still has one to build, while a spec whose phases are
 * all done has none whether it was finished a minute ago or a month ago.
 *
 * THREE OUTCOMES. `null` means cannot tell — a legacy bare `<name>.md`, an
 * overview carrying its phases inline, a folder this cannot see. The caller
 * must route that to leaving things as they are: an absence is not evidence
 * that a spec has no phases (`.claude/rules/negative-checks.md` rules 1 and 4).
 *
 * WHAT WOULD FOOL THIS: a spec whose phase files exist but whose statuses were
 * never updated reads as unfinished, so the button stays offered — the harmless
 * direction. The opposite error, reading a live spec as finished, would take a
 * file claiming Done that is not, which is a lie in the repo rather than a gap
 * in this reader.
 */
function readPhases(specDir, { overviewFile = '00-overview.md' } = {}) {
  let entries
  try {
    entries = fs.readdirSync(specDir, { withFileTypes: true })
  } catch {
    return null
  }
  const files = entries
    .filter((e) => e.isFile() && /^\d\d-.+\.md$/.test(e.name) && e.name !== overviewFile)
    .map((e) => e.name)
    .sort()
  // No phase files is not "no phases" — it is a legacy layout whose phases live
  // inline in the overview, and this reader cannot see them.
  if (!files.length) return null

  let done = 0
  for (const name of files) {
    let text
    try {
      text = fs.readFileSync(path.join(specDir, name), 'utf8')
    } catch {
      return null
    }
    if (phaseIsDone(text)) done++
  }
  return { total: files.length, done, hasNextPhase: done < files.length, live: livePhase(specDir, files) }
}

/**
 * The phase this diff is about — its number, title, goal and tasks.
 *
 * WHICH PHASE. The one in progress, else the last one done. A goal shown beside
 * a diff that predates it is worse than no goal at all, and those two are the
 * only phases a diff can plausibly be about: work in flight, or work just
 * finished and not yet committed.
 *
 * `null` throughout rather than a half-filled object — a phase file this cannot
 * parse is a phase with nothing to say, and the page omits the section rather
 * than rendering an empty one.
 */
function livePhase(specDir, files) {
  let inProgress = null
  let lastDone = null
  for (const name of files) {
    let text
    try {
      text = fs.readFileSync(path.join(specDir, name), 'utf8')
    } catch {
      continue
    }
    const parsed = parsePhase(text, name)
    if (!parsed) continue
    if (phaseIsDone(text)) lastDone = parsed
    else if (phaseIsStarted(text)) inProgress = inProgress || parsed
  }
  return inProgress || lastDone
}

/** Is this phase under way? The status line wins, for `phaseIsDone`'s reason. */
function phaseIsStarted(text) {
  const status = /^>.*\*\*Status:\*\*\s*(.+)$/m.exec(text)
  if (status) return /^in progress\b/i.test(status[1].trim())
  return /^#\s.*🔄\s*$/m.test(text)
}

/**
 * One phase file's readable parts. Pure, and tolerant: every field but `n` is
 * optional, because a phase file someone wrote by hand is still a phase file.
 */
function parsePhase(text, name) {
  const num = /^(\d\d)-/.exec(name)
  if (!num) return null
  const heading = /^#\s+(.+?)\s*$/m.exec(text)
  // `# Phase 1 — The engine reads the phase index ✅` → the title between the
  // dash and the status emoji, which is the half a reader wants.
  let title = heading ? heading[1] : ''
  title = title.replace(/^Phase\s+\d+\s*[—–-]\s*/i, '').replace(/\s*[⬜🔄✅]\s*$/u, '').trim()
  const goal = /^\*\*Goal:\*\*\s*([\s\S]*?)(?:\n\n|\n##)/m.exec(text)
  // LINE BY LINE, not one regex. A task wraps across lines with the
  // continuation indented, and an `$` under `/m` matches at every line end — so
  // the obvious regex silently truncates every wrapped task at its first line.
  // It looked right on the short ones, which is why this is done the long way.
  const tasks = []
  for (const line of text.split('\n')) {
    const start = /^- \[([ xX])\]\s*(.*)$/.exec(line)
    if (start) {
      tasks.push({ done: start[1].toLowerCase() === 'x', text: start[2].trim() })
      continue
    }
    // An indented non-empty line continues the task above it. Anything else —
    // a blank line, a heading, an unindented paragraph — ends the list.
    if (!tasks.length) continue
    if (/^\s+\S/.test(line)) tasks[tasks.length - 1].text += ' ' + line.trim()
    else if (line.trim()) break
  }
  return {
    n: Number(num[1]),
    title,
    goal: goal ? goal[1].replace(/\s+/g, ' ').trim() : null,
    tasks,
  }
}

/**
 * The tracker ticket a spec is linked to, as `{ id, url }`, or null.
 *
 * Read straight out of the overview's frontmatter, where every provider stamps
 * it. The base is tracker-free, so this knows nothing about Linear beyond the
 * two key names a provider writes — an unlinked spec, or a project with no
 * provider installed, simply has neither and gets `null`.
 *
 * ONLY http(s) URLS SURVIVE. The value comes out of a file someone edits, and
 * the page turns it into an `href`; `javascript:` in that position is script
 * execution on a page served over the network. An id with an unusable url is
 * still worth having, so the id is kept and the link dropped rather than the
 * whole ticket.
 */
function readTicket(text) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!fm) return null
  const field = (name) => {
    const m = new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(fm[1])
    if (!m) return null
    const v = m[1].trim().replace(/^["']|["']$/g, '').trim()
    return v || null
  }
  const id = field('linear_identifier')
  if (!id) return null
  const url = field('linear_url')
  return { id, url: url && /^https?:\/\//i.test(url) ? url : null }
}

/**
 * The spec's own `## Problem` and `## Impact`, plus its tracker ticket, for the
 * page's header.
 *
 * WHAT WOULD FOOL THIS: a spec that renames those headings, or a legacy bare
 * `<name>.md` with no overview at all. Both yield `null`, which the caller
 * routes to omitting the header — the page rendered without one yesterday and
 * still does (`.claude/rules/negative-checks.md` rule 4).
 */
function readOverview(specDir, { overviewFile = '00-overview.md' } = {}) {
  let text
  try {
    text = fs.readFileSync(path.join(specDir, overviewFile), 'utf8')
  } catch {
    return null
  }
  const problem = sectionOf(text, 'Problem') || sectionOf(text, 'Symptom')
  const impact = impactRows(sectionOf(text, 'Impact'))
  const ticket = readTicket(text)
  // The ticket counts towards "is there anything to say": a spec linked to a
  // tracker but carrying neither section still has a header worth drawing.
  if (!problem && !impact && !ticket) return null
  return {
    ...(problem ? { problem } : {}),
    ...(impact ? { impact } : {}),
    ...(ticket ? { ticket } : {}),
  }
}

/**
 * The body under one `## Heading`, up to the next one. Trimmed, or null.
 *
 * SLICED, not lookahead-matched. The obvious regex ends with
 * `(?=^##\s|\Z)` — and JS has no `\Z`, so that alternative is a literal
 * `Z` and every section at the END of a file returns nothing. It passed on the
 * spec used to write it, whose Problem happened to be followed by another
 * heading, and failed on a bug spec's Symptom and on any Impact table written
 * last.
 */
function sectionOf(text, heading) {
  const open = new RegExp(`^##\\s+${heading}\\s*$`, 'm').exec(text)
  if (!open) return null
  const from = open.index + open[0].length
  const next = /^##\s/m.exec(text.slice(from))
  const body = (next ? text.slice(from, from + next.index) : text.slice(from)).trim()
  return body || null
}

/**
 * The Impact table's rows. The heading is always present in a spec, and the
 * table is not — a spec touching no external surface writes a one-line sentence
 * instead, which is a real answer and is returned as prose.
 */
function impactRows(section) {
  if (!section) return null
  const rows = []
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 3) continue
    // The header and its `|---|` separator, dropped by shape rather than by
    // position — a spec that omits either still yields its rows.
    if (/^-{2,}$/.test(cells[0].replace(/:/g, ''))) continue
    if (/^surface$/i.test(cells[0]) && /^change$/i.test(cells[1])) continue
    rows.push({ surface: cells[0], change: cells[1], detail: cells[2] })
  }
  if (rows.length) return { rows }
  const prose = section.split('\n').map((l) => l.trim()).filter(Boolean).join(' ').replace(/^_|_$/g, '')
  return prose ? { prose } : null
}

/**
 * Is one phase file finished? Pure.
 *
 * THE STATUS LINE WINS over the heading's emoji. Both are written by the
 * lifecycle skills and both are kept in step, but a hand edit that fixes one
 * and forgets the other far more often leaves a stale emoji than stale prose —
 * and the emoji is the half a reader's eye skips.
 */
function phaseIsDone(text) {
  const status = /^>.*\*\*Status:\*\*\s*(.+)$/m.exec(text)
  if (status) return /^done\b/i.test(status[1].trim())
  return /^#\s.*✅\s*$/m.test(text)
}

// Split a `feat-`/`bug-`/`hotfix-` prefix. Unknown prefix → type defaults to
// `feat` and the whole folder name is the slug.
function splitPrefix(folder) {
  const m = /^(feat|bug|hotfix)-(.+)$/.exec(folder)
  if (m) return { type: m[1], slug: m[2] }
  return { type: 'feat', slug: folder }
}

// Repo identity used for token expansion.
function repoInfo(dir) {
  const repo = path.basename(dir)
  const repoSlug = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return { repo, repoSlug }
}

// Replace {token} occurrences from `tokens`; unknown tokens are left intact.
function expandTokens(str, tokens) {
  return String(str).replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : m,
  )
}

// Read a named field from a spec's 00-overview.md YAML frontmatter, if present.
// `field` is provider-neutral (e.g. a tracker's ticket-id field, configured via
// `branch.identifierField`). Returns null when there's no frontmatter / field /
// file, or no field name was given.
function readFrontmatterField(specPath, field) {
  if (!field) return null
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    return null
  }
  const fm = /^---\n([\s\S]*?)\n---/.exec(raw)
  if (!fm) return null
  const m = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(fm[1])
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '') || null
}

/**
 * Read a spec's `> **Stack:** …` blockquote field from 00-overview.md and map it
 * to the isolation stack: any value containing `docker` → `'docker'`, otherwise
 * `'worktree'`. A spec with no field falls back to the project default — which
 * preserves pre-`Stack` behaviour: with Docker available (`docker.enabled`) a
 * legacy spec still gets Docker, else it's worktree-only. The planner ANDs this
 * with the master switch, so an explicit `worktree` always suppresses Docker.
 */
function readStackField(specPath, config) {
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    raw = null
  }
  const m = raw && /^>\s*\*\*Stack:\*\*\s*(.+)$/m.exec(raw)
  if (m) {
    return /docker/i.test(m[1]) ? 'docker' : 'worktree'
  }
  return config.docker && config.docker.enabled ? 'docker' : 'worktree'
}

/**
 * Read a spec's `> **Base version:** <tag>` blockquote field from 00-overview.md.
 * This is the release tag a hotfix forks its worktree from (e.g. `v33.16.4`),
 * authored by the `/spec-hotfix` skill. Returns the trimmed tag, or null when the
 * field / file is absent — so a non-hotfix spec resolves to `baseRef: null` and
 * provisioning forks from base HEAD as before.
 */
function readBaseVersionField(specPath) {
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    return null
  }
  const m = /^>\s*\*\*Base version:\*\*\s*(.+)$/m.exec(raw)
  if (!m) return null
  return m[1].trim().replace(/^["'`]|["'`]$/g, '') || null
}

/**
 * Derive the git branch for a spec from the provider-neutral `branch.pattern`
 * (`{type}`, `{slug}`, and optionally `{identifier}`). When the pattern uses
 * `{identifier}`, the id is read from the frontmatter field named by
 * `branch.identifierField` (a tracker provider writes it); if that field is unset
 * or absent on the spec, the branch falls back to `{type}/{slug}` so we never
 * emit a half-expanded name. No knowledge of any specific tracker lives here.
 */
function branchFor(spec, config) {
  const branch = (config.branch && config.branch.pattern) || '{type}/{slug}'
  const tokens = { type: spec.type, slug: spec.slug }
  if (/\{identifier\}/.test(branch)) {
    const field = config.branch && config.branch.identifierField
    const identifier = readFrontmatterField(spec.path, field)
    if (!identifier) return `${spec.type}/${spec.slug}`
    tokens.identifier = identifier
  }
  return expandTokens(branch, tokens)
}

/**
 * Resolve the integration base branch (the branch specs fork from and land back
 * onto). Precedence:
 *   1. `config.baseBranch` — explicit override
 *   2. `origin/HEAD` — the remote's default branch
 *   3. `main` if it exists locally
 *   4. `master` if it exists locally
 *   5. `main` — last-resort default
 *
 * `git(args)` runs a read-only git command and returns trimmed stdout, or `null`
 * on a non-zero exit / failure. It's injected so this stays pure and unit-testable
 * with no live git; the CLI supplies a real reader. (Note: `show-ref --quiet`
 * emits no stdout on success, so a non-null `''` still means "exists".)
 */
function resolveBaseBranch(config, git) {
  const explicit = config && typeof config.baseBranch === 'string' && config.baseBranch.trim()
  if (explicit) return explicit

  const originHead = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (originHead) return originHead.replace(/^origin\//, '')

  for (const name of ['main', 'master']) {
    if (git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]) !== null) return name
  }
  return 'main'
}

/**
 * Resolve `dir` to the primary checkout root — the parent of the shared git dir.
 * From the primary checkout `git rev-parse --git-common-dir` is `.git` (relative),
 * so the parent is `dir`; from a linked worktree it's the absolute `<main>/.git`,
 * so the parent is `<main>`. Anchoring every `spec-env` command here means they
 * resolve `{repo}` / worktree paths / the registry identically whether run from
 * `main` or a worktree. `git(args)` returns trimmed stdout or `null` (not a repo)
 * — injected for testability; a `null` degrades to `dir` (today's behaviour).
 */
function resolvePrimaryCheckout(dir, git) {
  const common = git(['rev-parse', '--git-common-dir'])
  return common ? path.dirname(path.resolve(dir, common)) : dir
}

/**
 * The current branch of a checkout, or `null` when detached (or not a repo).
 * `git` is a reader bound to the target checkout — for the live-overlay guard the
 * CLI binds it to the primary checkout. (`symbolic-ref --short HEAD` exits
 * non-zero on a detached HEAD, which the reader maps to `null`.)
 */
function currentBranch(git) {
  return git(['symbolic-ref', '--short', 'HEAD'])
}

/**
 * The live-overlay guard: is the primary checkout on the integration base branch
 * (free) or on a feature branch (a spec is in control)? Returns
 * `{ onBase, branch, baseBranch }` — a structured result, never a throw, so each
 * caller phrases its own refusal. `git` must be bound to the primary checkout.
 * `onBase` is false on a detached HEAD (`branch === null`), which is not the base.
 */
function assertPrimaryOnMain(config, git) {
  const baseBranch = resolveBaseBranch(config, git)
  const branch = currentBranch(git)
  return { onBase: branch === baseBranch, branch, baseBranch }
}

/**
 * Resolve a spec argument to its identity + isolation coordinates.
 * Throws a clear Error when the spec folder can't be found.
 *
 * `opts.preferDirs` are checkout roots searched BEFORE `dir` — the checkout the
 * caller is standing in, so the spec's bucket and headers come from the branch
 * they are on rather than from the base branch's stale copy.
 * `opts.searchDirs` adds fallback checkout roots to look under (after `dir`) when
 * locating the spec folder.
 *
 * **Identity/coordinate tokens still expand against `dir`** (the primary
 * checkout) in every case — `{repo}`, the worktree path, the docker project name
 * and the registry are repo-level facts that must be identical from anywhere.
 * That is `bug-spec-env-cwd-anchor`'s fix and it is deliberately untouched here;
 * only which *file* is read moves.
 */
function resolveSpec(specArg, dir, config, opts = {}) {
  const searchDirs = opts.searchDirs || []
  const preferDirs = opts.preferDirs || []
  const found = findSpecFolder(specArg, dir, searchDirs, preferDirs)
  if (!found) {
    // Name the roots we looked under: the usual cause is a spec that only exists
    // on its own branch, and the message should say where we didn't find it.
    throw new Error(
      `spec not found under specs/**: ${specArg} ` +
        `(searched: ${[...preferDirs, dir, ...searchDirs].join(', ')})`,
    )
  }

  const { type, slug } = splitPrefix(found.folder)
  const { repo, repoSlug } = repoInfo(dir)
  const tokens = { repo, repoSlug, slug }

  const stack = readStackField(found.path, config)
  // A hotfix forks its worktree from a release tag (its `Base version`) instead
  // of base HEAD; every other type resolves to baseRef:null (fork from HEAD).
  const baseRef = type === 'hotfix' ? readBaseVersionField(found.path) : null
  const spec = { folder: found.folder, bucket: found.bucket, path: found.path, type, slug, stack, baseRef }
  const branch = branchFor(spec, config)

  const worktreeRoot = expandTokens(config.worktree.root, tokens)
  const worktreeFolder = expandTokens(config.worktree.folderPattern, tokens)
  const worktreePath = path.resolve(dir, worktreeRoot, worktreeFolder)
  const projectName = expandTokens(config.docker.projectNamePattern, tokens)

  return {
    ...spec,
    repo,
    repoSlug,
    branch,
    worktreeRoot,
    worktreeFolder,
    worktreePath,
    projectName,
  }
}

/**
 * Every worktree git knows about, as absolute paths — the primary checkout
 * included, since `git worktree list` reports it as one.
 *
 * `git` is an injected reader, as everywhere else in this file: the caller owns
 * the child-process boundary, which is what keeps this module testable without
 * one.
 */
function liveWorktreePaths(git) {
  const out = git(['worktree', 'list', '--porcelain'])
  const paths = new Set()
  if (out == null) return paths
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      paths.add(path.resolve(line.slice('worktree '.length).trim()))
    }
  }
  return paths
}

// An in-progress spec lives on its *worktree branch*, not the primary checkout,
// so we must scan the worktrees too — otherwise a live spec's DB looks orphaned.
function collectSpecFolders(roots) {
  const folders = new Set()
  for (const root of roots) {
    for (const bucket of BUCKETS) {
      let entries
      try {
        entries = fs.readdirSync(path.join(root, 'specs', bucket), { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) if (entry.isDirectory()) folders.add(entry.name)
    }
  }
  return folders
}

/**
 * Resolve every spec folder (found in the primary checkout OR any worktree) to
 * `{ folder, slug, worktreePath }`. `searchDirs` lets `resolveSpec` locate a
 * spec that was authored on its branch and never committed to the primary
 * checkout.
 */
function allSpecs(dir, config, worktreePaths) {
  const searchDirs = [...worktreePaths]
  const specs = []
  for (const folder of collectSpecFolders([dir, ...searchDirs])) {
    try {
      const spec = resolveSpec(folder, dir, config, { searchDirs })
      specs.push({ folder: spec.folder, slug: spec.slug, worktreePath: spec.worktreePath })
    } catch {
      // Unresolvable folder (not a real spec) — skip.
    }
  }
  return specs
}

module.exports = {
  BUCKETS,
  resolveSpec,
  liveWorktreePaths,
  collectSpecFolders,
  allSpecs,
  resolveBaseBranch,
  resolvePrimaryCheckout,
  currentBranch,
  assertPrimaryOnMain,
  branchFor,
  splitPrefix,
  repoInfo,
  expandTokens,
  findSpecFolder,
  readPhases,
  phaseIsDone,
  phaseIsStarted,
  parsePhase,
  readOverview,
  readFrontmatterField,
  readStackField,
  readBaseVersionField,
}
