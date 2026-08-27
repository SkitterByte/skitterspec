'use strict'

/**
 * Push-side writeback: after `push` creates the spec issue + phase sub-issues in
 * Linear, the skill stamps each returned id back into the repo so the next push
 * updates rather than recreates. Everything here edits the repo in place:
 *
 *   - `stampSubIssueId(dir, file, id)` — add/update `linear_issue_id` in a phase
 *     file's frontmatter (locate the file with `findPhaseFileByTitle`).
 *   - `writeFrontmatter(dir, config, patch)` — patch `00-overview.md` frontmatter
 *     (e.g. the spec issue's `spec_identifier`, `last_synced_at`).
 *   - `stampIssueId(dir, text, id)` — legacy: append `(ID)` to a task line
 *     (tasks are no longer synced; kept for the sanitise/util paths).
 *
 * No remote read, no pull writeback — the repo is the source of truth.
 */

const fs = require('node:fs')
const path = require('node:path')
const { findTaskBlocks, renderTaskBlock, collapse, inferWidth } = require('./task-block.js')

// Serialize a JS value as a YAML-ish frontmatter scalar.
function serialize(value) {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(String(value)) // quoted string
}

// Split `---\n…\n---\n` frontmatter off the top. Returns { fmLines, body, had }.
function splitFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  if (!m) return { fmLines: [], body: raw, had: false }
  return { fmLines: m[1].split('\n'), body: raw.slice(m[0].length), had: true }
}

// Apply a key→value patch onto frontmatter lines, preserving order.
function patchFrontmatterLines(lines, patch) {
  const keys = new Set(Object.keys(patch))
  const out = []
  const seen = new Set()
  for (const line of lines) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (kv && keys.has(kv[1])) {
      out.push(`${kv[1]}: ${serialize(patch[kv[1]])}`)
      seen.add(kv[1])
    } else {
      out.push(line)
    }
  }
  for (const key of Object.keys(patch)) {
    if (!seen.has(key)) out.push(`${key}: ${serialize(patch[key])}`)
  }
  return out
}

/**
 * Update `00-overview.md` frontmatter under `snapshotDir` with `patch`
 * (key → value; nullish values are skipped). Returns the list of keys written.
 */
function writeFrontmatter(snapshotDir, config, patch) {
  const overviewFile = (config && config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const file = path.join(snapshotDir, overviewFile)
  const raw = fs.readFileSync(file, 'utf-8')

  const clean = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && v !== undefined) clean[k] = v
  }
  if (!Object.keys(clean).length) return []

  const { fmLines, body, had } = splitFrontmatter(raw)
  const patched = patchFrontmatterLines(fmLines, clean)
  const frontmatter = `---\n${patched.join('\n')}\n---\n`
  const next = had ? frontmatter + body : frontmatter + '\n' + raw

  fs.writeFileSync(file, next, 'utf-8')
  return Object.keys(clean)
}

// Phase files in a snapshot dir (01-*.md …), execution order.
function listPhaseFiles(snapshotDir) {
  try {
    return fs
      .readdirSync(snapshotDir)
      .filter((f) => /^\d\d-.*\.md$/.test(f) && !f.startsWith('00-'))
      .sort()
  } catch {
    return []
  }
}

// Find the phase file whose h1 title matches `name` (used to stamp a freshly
// created sub-issue's id back into the phase it came from).
function findPhaseFileByTitle(snapshotDir, name) {
  const want = String(name).trim()
  for (const file of listPhaseFiles(snapshotDir)) {
    const raw = fs.readFileSync(path.join(snapshotDir, file), 'utf-8')
    const h1 = /^#\s+(.*)$/m.exec(splitFrontmatter(raw).body)
    if (!h1) continue
    const title = h1[1]
      .replace(/\s*[⬜🔄✅]\s*$/u, '')
      .replace(/^Phase\s+\d+\s*[—–-]\s*/i, '')
      .trim()
    if (title === want) return file
  }
  return null
}

// Add/update linear_issue_id in a phase file's frontmatter (in place) — the
// sub-issue id for that phase.
function stampSubIssueId(snapshotDir, file, id) {
  const p = path.join(snapshotDir, file)
  const raw = fs.readFileSync(p, 'utf-8')
  const { fmLines, body, had } = splitFrontmatter(raw)
  const patched = patchFrontmatterLines(fmLines, { linear_issue_id: String(id) })
  const fm = `---\n${patched.join('\n')}\n---\n`
  fs.writeFileSync(p, had ? fm + body : fm + '\n' + raw, 'utf-8')
}

const INLINE_ID_RE = /\s*\(([A-Za-z][A-Za-z0-9]*-\d+)\)\s*$/

// Stamp an inline id onto the (idless) task line whose text matches — used after
// the skill creates an issue for a new local task.
function stampIssueId(snapshotDir, text, id) {
  const want = collapse(text)
  for (const file of listPhaseFiles(snapshotDir)) {
    const p = path.join(snapshotDir, file)
    const lines = fs.readFileSync(p, 'utf-8').split('\n')
    const width = inferWidth(lines)
    for (const b of findTaskBlocks(lines)) {
      if (!b.checkbox) continue // a plain sub-bullet is not a task — never stamp one
      if (INLINE_ID_RE.test(b.text)) continue
      if (b.text !== want) continue
      const rendered = renderTaskBlock({ indent: b.indent, done: b.mark === 'x', text: want, id }, width)
      lines.splice(b.start, b.end - b.start, ...rendered)
      fs.writeFileSync(p, lines.join('\n'), 'utf-8')
      return file
    }
  }
  return null
}

module.exports = {
  writeFrontmatter,
  splitFrontmatter,
  serialize,
  listPhaseFiles,
  findPhaseFileByTitle,
  stampSubIssueId,
  stampIssueId,
}
