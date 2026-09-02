'use strict'

/**
 * Retarget a mirror after the tracker's team key is renamed.
 *
 * Renaming a Linear team rewrites the key in every issue identifier
 * (`SKI-7` → `SKS-7`). The repo stamps those identifiers in three places — spec
 * frontmatter, the `linear-base` snapshot filenames, and the `subIssues` keys
 * inside those snapshots — and nothing moves them, so afterwards every stamped
 * spec is stale and `/spec-push` fails with `no issue found for SKI-7`.
 *
 * This module is the PURE half: it plans and applies a prefix move over the
 * repo's machine-read fields. It is provider-neutral by design (decision 8) —
 * "old prefix → new prefix over stamps and snapshots" involves no tracker at
 * all, so it belongs here beside `legacy.js`. Detecting the rename and
 * spot-checking an identifier are the only steps that touch a tracker, and they
 * live in the provider's CLI.
 *
 * **Frontmatter only — never prose.** A naive repo-wide `SKI-` → `SKS-`
 * substitution passes a casual eyeball and quietly rewrites the historical
 * record ("Probe SKI-28 falsified the reported hypothesis").
 * `.claude/rules/spec-planning.md` says never delete historical notes, so prose
 * mentions, doc placeholders and test fixtures are out of scope entirely.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { parseFrontmatter } = require('./normalize.js')

// The lifecycle buckets a spec can live in. Kept local rather than imported so
// sync-core stays free of the common package.
const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']

// An issue identifier: team key, dash, number. Matched CASE-INSENSITIVELY
// because `linear_url` carries the identifier lowercased in its path
// (`…/issue/reu-188/retire-…`). Matching only uppercase left 29 of 33 real URLs
// in ~/code/ereqs pointing at the old key — the same ones the hand-repair
// missed. A rewrite only happens when the key matches `oldKey`, so an unrelated
// token like `utf-8` is never in scope.
const IDENTIFIER_RE = /\b([A-Za-z][A-Za-z0-9]*)-(\d+)\b/g

const STAMP_FIELDS = ['linear_identifier', 'linear_issue_id']
const SNAPSHOT_SUFFIX = '.base.json'

// Every `.md` under each spec folder — overview and phase files alike, plus the
// legacy bare `<name>.md` shape.
function specMarkdownFiles(dir) {
  const files = []
  for (const bucket of BUCKETS) {
    const root = path.join(dir, 'specs', bucket)
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const p = path.join(root, entry.name)
      if (entry.isDirectory()) {
        for (const f of fs.readdirSync(p)) if (f.endsWith('.md')) files.push(path.join(p, f))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(p)
      }
    }
  }
  return files.sort()
}

const snapshotDirOf = (dir, config) => path.resolve(dir, config.sync.baseDir)

function snapshotFiles(dir, config) {
  try {
    return fs.readdirSync(snapshotDirOf(dir, config)).filter((f) => f.endsWith(SNAPSHOT_SUFFIX)).sort()
  } catch {
    return []
  }
}

// Rewrite `<oldKey>-<n>` → `<newKey>-<n>` in `text`, leaving every other
// identifier alone. The number is preserved: a team rename does not renumber.
function movePrefix(text, oldKey, newKey) {
  const want = String(oldKey).toLowerCase()
  return String(text).replace(IDENTIFIER_RE, (whole, key, n) => {
    if (key.toLowerCase() !== want) return whole
    // Preserve the case it was written in: a URL path segment stays lowercase,
    // a frontmatter stamp stays uppercase.
    const next = key === key.toLowerCase() ? newKey.toLowerCase() : newKey
    return `${next}-${n}`
  })
}

/**
 * The recorded key this repo believes it is stamped with.
 *
 * `config.linear.teamKey` is authoritative when set — but it defaults to `""`
 * and is written by `init-config` and never read, which is exactly why a stale
 * key never failed loudly. So fall back to the prefix actually observed in the
 * stamps. Disagreeing stamps are reported, never guessed at and never thrown:
 * the caller phrases its own refusal.
 *
 * @returns {{key: string|null, source: 'config'|'stamps'|null, keys?: string[], reason?: string}}
 */
function deriveRecordedKey(dir, config) {
  const configured = (config.linear && config.linear.teamKey) || ''
  if (configured) return { key: configured, source: 'config' }

  const keys = new Set()
  for (const file of specMarkdownFiles(dir)) {
    let raw
    try {
      raw = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    const { data } = parseFrontmatter(raw)
    for (const field of STAMP_FIELDS) {
      if (!data[field]) continue
      const m = /^([A-Z][A-Z0-9]*)-\d+$/.exec(String(data[field]).trim())
      if (m) keys.add(m[1])
    }
  }
  for (const name of snapshotFiles(dir, config)) {
    const m = /^([A-Z][A-Z0-9]*)-\d+$/.exec(name.slice(0, -SNAPSHOT_SUFFIX.length))
    if (m) keys.add(m[1])
  }

  const found = [...keys].sort()
  if (found.length === 1) return { key: found[0], source: 'stamps' }
  if (!found.length) return { key: null, source: null, keys: [], reason: 'no stamped identifiers found under specs/' }
  return {
    key: null,
    source: null,
    keys: found,
    reason: `stamps disagree — found ${found.join(', ')}; set linear.teamKey to the recorded one`,
  }
}

/**
 * Plan the prefix move. Pure: reads the repo, writes nothing.
 *
 * @returns {{stamps: Array<{file, from, to}>, snapshots: Array<{file, from, to, keys}>, configKey: {from,to}|null}}
 *   `stamps[].from`/`to` are whole file contents; the caller writes them as-is.
 */
function planRetarget({ dir, oldKey, newKey, config }) {
  const stamps = []
  for (const file of specMarkdownFiles(dir)) {
    let raw
    try {
      raw = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    // Scoped to the leading `---` block. Everything after it is prose and is
    // returned byte-identical.
    const m = /^(---\n[\s\S]*?\n---)([\s\S]*)$/.exec(raw)
    if (!m) continue
    const head = movePrefix(m[1], oldKey, newKey)
    if (head === m[1]) continue
    stamps.push({ file: path.relative(dir, file), from: raw, to: head + m[2] })
  }

  const snapshots = []
  const prefix = `${oldKey}-`
  for (const name of snapshotFiles(dir, config)) {
    const ident = name.slice(0, -SNAPSHOT_SUFFIX.length)
    let body
    try {
      body = JSON.parse(fs.readFileSync(path.join(snapshotDirOf(dir, config), name), 'utf-8'))
    } catch {
      continue
    }
    // The `subIssues` map is keyed BY IDENTIFIER, so a rename strands every key
    // inside the file as well as the filename. The hashes are content-derived
    // and stay valid — only the keys move.
    const keys = {}
    let rekeyed = false
    for (const [k, hash] of Object.entries(body.subIssues || {})) {
      const next = k.startsWith(prefix) ? `${newKey}-${k.slice(prefix.length)}` : k
      if (next !== k) rekeyed = true
      keys[next] = hash
    }
    const renamed = ident.startsWith(prefix) ? `${newKey}-${ident.slice(prefix.length)}${SNAPSHOT_SUFFIX}` : name
    if (renamed === name && !rekeyed) continue
    snapshots.push({ file: name, from: name, to: renamed, keys, body })
  }

  const recorded = (config.linear && config.linear.teamKey) || ''
  const configKey = recorded && recorded !== newKey ? { from: recorded, to: newKey } : null

  return { stamps, snapshots, configKey }
}

// True when a plan would change nothing.
const isEmptyRetarget = (plan) => !plan.stamps.length && !plan.snapshots.length && !plan.configKey

// `git status --porcelain` over `dir`: [] clean, the lines when dirty, null when
// this is not a git repo.
function dirtyPaths(dir) {
  let out
  try {
    out = execFileSync('git', ['-C', dir, 'status', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
  return out ? out.split('\n') : []
}

// Move a file, preferring `git mv` so history follows it. Falls back to a plain
// rename when the file is untracked (git mv refuses those) or git is absent.
function moveFile(dir, from, to) {
  try {
    execFileSync('git', ['-C', dir, 'mv', from, to], { stdio: ['ignore', 'ignore', 'ignore'] })
    return 'git mv'
  } catch {
    fs.renameSync(path.join(dir, from), path.join(dir, to))
    return 'rename'
  }
}

/**
 * Apply a plan. Everything moves together — stamps, snapshot names, the keys
 * inside them, and the config key — because a half-retargeted repo is harder to
 * reason about than an un-retargeted one.
 */
function applyRetarget(plan, { dir, config }) {
  const changed = { files: [], snapshots: [], configKey: false }

  for (const s of plan.stamps) {
    fs.writeFileSync(path.join(dir, s.file), s.to, 'utf-8')
    changed.files.push(s.file)
  }

  const baseRel = config.sync.baseDir
  for (const snap of plan.snapshots) {
    // Re-key BEFORE the rename, so the path being written is the one the plan
    // recorded.
    const src = path.join(dir, baseRel, snap.from)
    fs.writeFileSync(src, JSON.stringify({ ...snap.body, subIssues: snap.keys }, null, 2) + '\n', 'utf-8')
    if (snap.to !== snap.from) {
      const how = moveFile(dir, path.join(baseRel, snap.from), path.join(baseRel, snap.to))
      changed.snapshots.push({ ...snap, how })
    }
  }

  if (plan.configKey) {
    // Textual, not parse-and-restringify: the config is hand-edited and carries
    // ordering (and possibly comments) a JSON round-trip would discard.
    const file = path.join(dir, 'specs', '.core', 'linear.config.json')
    const raw = fs.readFileSync(file, 'utf-8')
    fs.writeFileSync(file, raw.replace(/("teamKey"\s*:\s*")([^"]*)(")/, `$1${plan.configKey.to}$3`), 'utf-8')
    changed.configKey = true
  }

  return changed
}

module.exports = {
  planRetarget,
  applyRetarget,
  deriveRecordedKey,
  isEmptyRetarget,
  dirtyPaths,
  movePrefix,
  specMarkdownFiles,
}
