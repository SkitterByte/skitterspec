'use strict'

/**
 * Local snapshot writes for pull (Linear → repo).
 *
 * Phase 2 applies **frontmatter-mapped** pulled fields — the `pull`-owned data
 * Linear genuinely owns (`workflowState` → `spec_status`, `priority`, `labels`)
 * plus sync bookkeeping (`last_synced_at`, ids) — by surgically editing the YAML
 * frontmatter of `00-overview.md` and leaving the markdown body byte-for-byte
 * untouched. Existing keys are updated in place (order preserved); new keys are
 * appended; a file with no frontmatter gets one prepended.
 *
 * Body/`both`-owned fields (`description`, `milestones`, …) are NOT written back
 * here — that denormalizer is a tracked follow-up (see the spec). Callers advance
 * the base only for fields they actually applied, so an un-applied remote edit
 * stays pending rather than being silently marked synced.
 */

const fs = require('node:fs')
const path = require('node:path')

// Serialize a JS value as a YAML-ish frontmatter scalar. null/undefined → the
// key is dropped (caller shouldn't pass those).
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
  // Append any new keys not already present.
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

module.exports = {
  writeFrontmatter,
  splitFrontmatter,
  serialize,
}
