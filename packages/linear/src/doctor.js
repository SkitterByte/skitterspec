'use strict'

/**
 * Identifier drift — the offline half of `spec-sync doctor`.
 *
 * When a Linear team is renamed (`REU` → `ERQ`), nothing in the repo moves: every
 * stamped `linear_identifier` / `linear_issue_id` / `linear_url`, the config's
 * `teamKey`, and every `linear-base/<ID>.base.json` filename keeps the old
 * prefix. Nothing detected it and nothing repaired it; the first occurrence was
 * fixed by hand across 221 refs in 54 files.
 *
 * This module only SCANS — it reads the repo and reports what disagrees with a
 * team key it is handed. It performs no network calls and writes nothing, so the
 * detection logic is testable without an adapter. Deciding what the current key
 * IS (a Linear read) and repairing (phase 3) live in `cli-sync.js`.
 */

const fs = require('node:fs')
const path = require('node:path')

const { BUCKETS } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')
const { parseFrontmatter } = require('@skitterbyte/skitterspec-sync-core')

// A Linear issue identifier: an uppercase team key, a dash, a number. The key is
// captured so drift is a prefix comparison rather than a guess.
const IDENTIFIER_RE = /^([A-Z][A-Z0-9]*)-(\d+)$/
// The same, embedded in a URL path (`…/issue/REU-151/slug`).
const URL_IDENTIFIER_RE = /\b([A-Z][A-Z0-9]*)-(\d+)\b/g

const STAMP_FIELDS = ['linear_identifier', 'linear_issue_id']

// Every `.md` under each spec folder — overview and phase files alike, plus the
// legacy bare `<name>.md` shape. Anything stamped lives in one of these.
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

// Retarget one identifier onto `currentKey`, preserving the number. Returns null
// when it is already current or is not an identifier at all.
function retarget(value, currentKey) {
  const m = IDENTIFIER_RE.exec(String(value).trim())
  if (!m || m[1] === currentKey) return null
  return `${currentKey}-${m[2]}`
}

/**
 * Scan the repo for identifiers that disagree with `currentKey`.
 *
 * @returns {{
 *   stamps: Array<{file, field, from, to}>,
 *   urls: Array<{file, from, to}>,
 *   snapshots: Array<{from, to}>,
 *   snapshotKeys: Array<{file, from, to}>,
 *   mentions: Array<{file, from, to}>,   // prose refs — reported, never repaired
 *   config: {from, to}|null,
 *   refs: Array<{from, to}>,
 * }} `refs` is the DISTINCT set of drifted identifiers — what the caller checks
 *    against Linear, so 221 stamps of 198 identifiers cost 198 reads, not 221.
 */
function scanDrift(dir, config, currentKey) {
  const stamps = []
  const urls = []
  const seen = new Map()
  const note = (from, to) => seen.set(from, to)

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
      const to = retarget(data[field], currentKey)
      if (!to) continue
      stamps.push({ file: path.relative(dir, file), field, from: String(data[field]).trim(), to })
      note(String(data[field]).trim(), to)
    }
    if (data.linear_url) {
      const url = String(data.linear_url)
      let changed = url
      for (const m of url.matchAll(URL_IDENTIFIER_RE)) {
        const to = retarget(m[0], currentKey)
        if (!to) continue
        changed = changed.split(m[0]).join(to)
        note(m[0], to)
      }
      if (changed !== url) urls.push({ file: path.relative(dir, file), from: url, to: changed })
    }
  }

  const snapshots = []
  const snapshotKeys = []
  const baseDir = path.resolve(dir, config.sync.baseDir)
  let snapshotNames = []
  try {
    snapshotNames = fs.readdirSync(baseDir).filter((f) => f.endsWith('.base.json'))
  } catch {
    /* no snapshots yet — nothing to retarget */
  }
  for (const name of snapshotNames.sort()) {
    const to = retarget(name.slice(0, -'.base.json'.length), currentKey)
    if (to) {
      snapshots.push({ from: name, to: `${to}.base.json` })
      note(name.slice(0, -'.base.json'.length), to)
    }
    // A snapshot's `subIssues` map is KEYED BY IDENTIFIER, so a rename strands
    // every key inside the file as well as the filename. Missing these made the
    // first scan report 59 refs where the repo really carries ~198: the bulk of
    // a linked repo's identifiers live in here, not in frontmatter. The hashes
    // are content-derived and stay valid — only their keys move.
    let body
    try {
      body = JSON.parse(fs.readFileSync(path.join(baseDir, name), 'utf-8'))
    } catch {
      continue
    }
    for (const ident of Object.keys((body && body.subIssues) || {})) {
      const keyTo = retarget(ident, currentKey)
      if (!keyTo) continue
      snapshotKeys.push({ file: path.join(config.sync.baseDir, name), from: ident, to: keyTo })
      note(ident, keyTo)
    }
  }

  // Prose MENTIONS of a stale identifier — `(REU-61)` beside a task, "the REU-196
  // spec claimed …". These are human-written references, not functional stamps,
  // and repair deliberately leaves them alone: rewriting narrative text is a
  // different risk class, and an identifier-shaped token in prose need not be a
  // Linear ref at all. They are counted anyway so the report cannot imply a
  // `--write` left the repo fully retargeted when ~145 mentions still say REU.
  //
  // Only prefixes that actually appear in the repo's STAMPS are counted, so an
  // unrelated `ABC-123` in prose is never mistaken for a drifted ref.
  const staleKeys = new Set([...seen.keys()].map((k) => k.split('-')[0]))
  const mentions = []
  if (staleKeys.size) {
    for (const file of specMarkdownFiles(dir)) {
      let raw
      try {
        raw = fs.readFileSync(file, 'utf-8')
      } catch {
        continue
      }
      const { body } = parseFrontmatter(raw)
      for (const m of String(body).matchAll(URL_IDENTIFIER_RE)) {
        if (!staleKeys.has(m[1]) || m[1] === currentKey) continue
        mentions.push({ file: path.relative(dir, file), from: m[0], to: `${currentKey}-${m[2]}` })
      }
    }
  }

  const configured = (config.linear && config.linear.teamKey) || ''
  const configDrift = configured && configured !== currentKey ? { from: configured, to: currentKey } : null

  return {
    stamps,
    urls,
    snapshots,
    snapshotKeys,
    mentions,
    config: configDrift,
    refs: [...seen.entries()].map(([from, to]) => ({ from, to })).sort((a, b) => a.from.localeCompare(b.from)),
  }
}

// True when a scan found nothing to repair.
function isClean(drift) {
  return (
    !drift.stamps.length &&
    !drift.urls.length &&
    !drift.snapshots.length &&
    !drift.snapshotKeys.length &&
    !drift.config
  )
}

// How many distinct files a repair would touch.
function fileCount(drift) {
  return new Set([...drift.stamps.map((s) => s.file), ...drift.urls.map((u) => u.file)]).size
}

module.exports = { scanDrift, isClean, fileCount, retarget, specMarkdownFiles }
