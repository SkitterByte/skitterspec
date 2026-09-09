'use strict'

/**
 * Release gating — the loader, the header reader, and the check.
 *
 * The feature records ONE decision per spec: does this ship behind a feature
 * flag, or land live? Skitterspec never learns how a project does flags; it asks
 * the question, cites the project's own documentation, and reads back what was
 * written. Strictly opt-in: with `specs/.core/gating.config.json` absent, every
 * function here reports "not configured" and nothing else changes.
 *
 * Mirrors `src/env/config.js` (frozen defaults, merge known keys only, never
 * throws on absence) so the two opt-in configs behave alike.
 */

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_FILE = path.join('specs', '.core', 'gating.config.json')

// Only these two buckets are ever read.
//
// A SPEC WRITTEN BEFORE GATING WAS ADOPTED HAS NO HEADER AND IS NOT BROKEN. That
// is the blind spot this check would otherwise walk into: "no Gating: line" is
// evidence of an unanswered question only for a spec that could have been asked,
// and every finished or abandoned spec predates the question by definition. They
// are excluded STRUCTURALLY rather than by a filter someone must remember — a
// completed spec is not in range, so no future edit can make it fire. Pre-existing
// specs still in flight ARE reported, deliberately: they are live work, the
// question genuinely still applies, and the report never blocks anything.
const ACTIVE_BUCKETS = ['backlog', 'in-progress']

const DEFAULT_CONFIG = Object.freeze({
  guidance: '',
  default: 'none: <reason>',
})

/**
 * Load `specs/.core/gating.config.json`. Returns `{ config, present }`;
 * `present:false` means the project has not adopted gating, which is read as
 * "this project does not use feature flags" — never as an error.
 */
function loadGatingConfig(dir = process.cwd()) {
  const base = { ...DEFAULT_CONFIG }
  let raw
  try {
    raw = fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return { config: base, present: false }
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`)
  }
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.guidance === 'string') base.guidance = parsed.guidance.trim()
    if (typeof parsed.default === 'string' && parsed.default.trim()) {
      base.default = parsed.default.trim()
    }
  }
  return { config: base, present: true }
}

/**
 * Read a spec's `> **Gating:** …` blockquote field from `00-overview.md`.
 *
 * Returns `{ raw, kind }` with four kinds, because there are four states and
 * collapsing them is what made the omission invisible in the first place:
 *
 *   flag     a flag name — ships behind it
 *   none     `none: <reason>` — deliberately not flagged, and why
 *   invalid  present but says nothing: empty, or a bare `none` with no reason
 *   missing  no field at all
 *
 * `invalid` and `missing` are kept apart on purpose. A bare `none` is someone
 * answering without deciding; a missing line is nobody having been asked. They
 * want different words.
 */
function readGatingField(specPath) {
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    return { raw: null, kind: 'missing' }
  }
  const m = /^>\s*\*\*Gating:\*\*\s*(.*)$/m.exec(raw)
  if (!m) return { raw: null, kind: 'missing' }
  const value = m[1].trim().replace(/^["'`]|["'`]$/g, '')
  if (!value) return { raw: value, kind: 'invalid' }
  const bare = /^none\b/i.test(value)
  if (bare) {
    // `none` alone, or `none:` with nothing after it, is a shrug rather than a
    // decision — the reason half is the whole point of recording it.
    const reason = value.replace(/^none\b:?/i, '').trim()
    return { raw: value, kind: reason ? 'none' : 'invalid' }
  }
  return { raw: value, kind: 'flag' }
}

// Active specs on disk, as `{ folder, bucket, path }`. A bucket that does not
// exist is simply empty — git does not store empty directories, so a missing
// `specs/backlog/` is the ordinary state of a project with nothing queued.
function activeSpecs(dir) {
  const out = []
  for (const bucket of ACTIVE_BUCKETS) {
    const root = path.join(dir, 'specs', bucket)
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isDirectory()) out.push({ folder: e.name, bucket, path: path.join(root, e.name) })
    }
  }
  return out
}

/**
 * Check specs for a recorded gating decision.
 *
 * Advisory by construction: it returns findings and says nothing about what the
 * caller should do. Nothing here exits, throws on a finding, or blocks.
 *
 * @returns {{configured: boolean, findings: Array<{folder, bucket, kind, raw}>,
 *            checked: number, guidance: string}}
 */
function checkGating(dir, specs) {
  const { config, present } = loadGatingConfig(dir)
  if (!present) return { configured: false, findings: [], checked: 0, guidance: '' }
  const targets = specs && specs.length ? specs : activeSpecs(dir)
  const findings = []
  for (const spec of targets) {
    const { kind, raw } = readGatingField(spec.path)
    if (kind === 'missing' || kind === 'invalid') {
      findings.push({ folder: spec.folder, bucket: spec.bucket, kind, raw })
    }
  }
  return { configured: true, findings, checked: targets.length, guidance: config.guidance }
}

module.exports = {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  ACTIVE_BUCKETS,
  loadGatingConfig,
  readGatingField,
  activeSpecs,
  checkGating,
}
