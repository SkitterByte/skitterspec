'use strict'

/**
 * Normalize a remote Project projection and a local spec snapshot into the SAME
 * field set, so the three-way compare (compare.js) can diff them field by field.
 *
 * Both `normalizeLocal(snapshotDir, config)` and `normalizeRemote(project, config)`
 * return an object whose keys are exactly `config.sync.fieldOwnership`'s keys —
 * identical field sets by construction. A field a given side can't supply is
 * `null` (scalars) or `[]` (collections), never absent, so the sets stay equal.
 *
 * Pure: `normalizeLocal` reads files under `snapshotDir` but makes no other side
 * effects and no Date.now()/Math.random(). `localOnlySections` are stripped from
 * the local `description` so they're never pushed to remote.
 */

const fs = require('node:fs')
const path = require('node:path')

// --- markdown / frontmatter parsing -----------------------------------------

// Split `---\n…\n---` frontmatter off the top. Returns { data, body }.
function parseFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  if (!m) return { data: {}, body: raw }
  const data = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    data[kv[1]] = parseScalar(kv[2].trim())
  }
  return { data, body: raw.slice(m[0].length) }
}

// Parse a frontmatter scalar: quoted string, JSON array, number, or bare string.
function parseScalar(v) {
  if (v === '') return null
  const unq = /^["'](.*)["']$/.exec(v)
  if (unq) return unq[1]
  if (v.startsWith('[')) {
    try {
      return JSON.parse(v)
    } catch {
      return v
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

// Split a markdown body into { title, sections } where sections maps a `## `
// heading text → its content (until the next `## `). The H1 `# ` is the title.
function parseSections(body) {
  const lines = body.split('\n')
  let title = null
  const sections = {}
  let current = null
  let buf = []
  const flush = () => {
    if (current !== null) sections[current] = buf.join('\n').trim()
  }
  for (const line of lines) {
    const h1 = /^#\s+(.*)$/.exec(line)
    const h2 = /^##\s+(.*)$/.exec(line)
    if (h1 && title === null) {
      title = h1[1].trim()
      continue
    }
    if (h2) {
      flush()
      current = h2[1].trim()
      buf = []
      continue
    }
    if (current !== null) buf.push(line)
  }
  flush()
  return { title, sections }
}

// Canonicalise markdown so semantically-equal content hashes equal across the
// boundary. Linear reserializes markdown on save (authored `-` bullets come back
// as `*`, trailing whitespace trimmed, blank runs collapsed), so without this a
// clean push→pull would report `description` as perpetually changed. Applied to
// the description on BOTH sides. Conservative: only unifies list markers and
// whitespace — the transforms actually observed from Linear.
function canonicalizeMarkdown(text) {
  if (text == null) return text
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    // Unordered-list marker at line start (`*`/`+`/`-`) → `-`. Requires a space
    // after the marker so bold/emphasis (`**Goal:**`) is untouched.
    .map((line) => line.replace(/^(\s*)[*+-]( +)/, '$1-$2').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Canonical milestone status from the phase-index emoji.
const EMOJI_STATUS = { '⬜': 'not-started', '🔄': 'in-progress', '✅': 'done' }

// Parse the "## Phases" index table into [{ name, status }] rows.
function parsePhaseIndex(phasesSection) {
  if (!phasesSection) return []
  const rows = []
  for (const line of phasesSection.split('\n')) {
    // | 1 | Phase name | ✅ | [01-…](01-…) |
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 5) continue
    const n = cells[1]
    if (!/^\d+$/.test(n)) continue // skip header + separator rows
    const name = cells[2]
    const emoji = (cells[3].match(/[⬜🔄✅]/u) || [])[0]
    rows.push({ name, status: EMOJI_STATUS[emoji] || 'not-started' })
  }
  return rows
}

// Read the phase files (01-*.md, 02-*.md …) in execution order.
function readPhaseFiles(snapshotDir) {
  let entries
  try {
    entries = fs.readdirSync(snapshotDir)
  } catch {
    return []
  }
  return entries
    .filter((f) => /^\d\d-.*\.md$/.test(f) && !f.startsWith('00-'))
    .sort()
    .map((file) => {
      const raw = fs.readFileSync(path.join(snapshotDir, file), 'utf-8')
      const goal = (/^\*\*Goal:\*\*\s*([\s\S]*?)(?:\n\n|$)/m.exec(raw) || [])[1] || ''
      const tasks = (raw.match(/^-\s*\[[ x]\]\s*.*$/gm) || []).map((t) =>
        t.replace(/^-\s*/, '').trim(),
      )
      return { phase: file.replace(/\.md$/, ''), goal: goal.trim(), tasks }
    })
}

// --- ownership-driven field set ---------------------------------------------

// Reduce an `extracted` map to exactly the configured field keys, defaulting a
// missing field to `null` so local and remote always share an identical set.
function toFieldSet(extracted, config) {
  const out = {}
  for (const field of Object.keys(config.sync.fieldOwnership)) {
    out[field] = field in extracted ? extracted[field] : null
  }
  return out
}

// --- local snapshot ---------------------------------------------------------

/**
 * Read a spec snapshot (its 00-overview.md + phase files) into the raw pieces the
 * extractors and callers need. Pure aside from reads under `snapshotDir`.
 */
function readSnapshot(snapshotDir, config) {
  const overviewFile = (config && config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const raw = fs.readFileSync(path.join(snapshotDir, overviewFile), 'utf-8')
  const { data, body } = parseFrontmatter(raw)
  const { title, sections } = parseSections(body)
  const phases = readPhaseFiles(snapshotDir)
  return { frontmatter: data, title, sections, phases, body }
}

// Build the pushed description: the overview prose with local-only sections
// removed. Keeps the title line for context.
function buildDescription(title, sections, localOnlySections) {
  const skip = new Set(localOnlySections || [])
  const parts = []
  if (title) parts.push(`# ${title}`)
  for (const [heading, content] of Object.entries(sections)) {
    if (skip.has(heading)) continue
    parts.push(`## ${heading}\n\n${content}`.trim())
  }
  return canonicalizeMarkdown(parts.join('\n\n')) || null
}

/**
 * Normalize a local spec snapshot into the configured field set.
 */
function normalizeLocal(snapshotDir, config) {
  const { frontmatter, title, sections, phases } = readSnapshot(snapshotDir, config)
  const extracted = {
    description: buildDescription(title, sections, config.sync.localOnlySections),
    milestones: parsePhaseIndex(sections.Phases),
    phaseBodies: phases.map((p) => ({ phase: p.phase, goal: p.goal })),
    acceptanceCriteria: sections['Acceptance criteria'] || null,
    taskBreakdown: phases.map((p) => ({ phase: p.phase, tasks: p.tasks })),
    workflowState: frontmatter.spec_status != null ? String(frontmatter.spec_status) : null,
    priority: frontmatter.priority != null ? frontmatter.priority : null,
    labels: Array.isArray(frontmatter.labels) ? frontmatter.labels : [],
  }
  return toFieldSet(extracted, config)
}

// --- remote projection ------------------------------------------------------

// Map a remote workflow-state name back to the local lifecycle bucket (the
// vocabulary `spec_status` uses) via config.states, so local and remote
// workflowState hash equal when semantically equal. Falls back to a lowercased
// raw value when the state isn't one of the configured names.
function bucketForState(state, config) {
  if (state == null) return null
  const states = (config && config.states) || {}
  const want = String(state).toLowerCase().trim()
  for (const [bucket, name] of Object.entries(states)) {
    if (typeof name === 'string' && name.toLowerCase().trim() === want) return bucket
  }
  return want
}

// Canonicalise a remote workflow-state name into the same vocabulary the local
// milestone emojis use, so equal states hash equal.
function canonicalRemoteStatus(state) {
  const s = String(state || '').toLowerCase().trim()
  if (!s) return 'not-started'
  if (/(done|complete|completed|merged)/.test(s)) return 'done'
  if (/(progress|started|doing|review)/.test(s)) return 'in-progress'
  if (/(backlog|todo|planned|triage)/.test(s)) return 'not-started'
  return s
}

// The real Linear projection carries the project's workflow state in `status`
// (an object `{ name, type }`); accept a bare string / legacy `state` too.
function remoteStateName(project) {
  const st = project.status != null ? project.status : project.state
  if (st == null) return null
  if (typeof st === 'object') return st.name != null ? st.name : st.type != null ? st.type : null
  return st
}

// Real Linear priority is an object `{ value, name }`; accept a bare number too.
function remotePriority(priority) {
  if (priority == null) return null
  if (typeof priority === 'object') return priority.value != null ? priority.value : null
  return priority
}

// Real Linear labels are `[{ id, name }]`; accept bare strings too.
function remoteLabels(labels) {
  if (!Array.isArray(labels)) return []
  return labels
    .map((l) => (typeof l === 'string' ? l : l && l.name != null ? l.name : null))
    .filter((n) => n != null)
}

// A real Linear milestone has no workflow state — only `progress` ("0%".."100%").
// Fall back to a legacy `status`/`state` when present (fixtures / older shapes).
function remoteMilestoneStatus(m) {
  if (m.status != null) return canonicalRemoteStatus(m.status)
  if (m.state != null) return canonicalRemoteStatus(m.state)
  if (m.progress != null) {
    const pct = parseInt(String(m.progress), 10)
    if (Number.isFinite(pct)) {
      if (pct >= 100) return 'done'
      if (pct > 0) return 'in-progress'
    }
    return 'not-started'
  }
  return 'not-started'
}

/**
 * Normalize a remote Project projection (from the Phase 2 MCP adapter, or a
 * fixture) into the same field set as `normalizeLocal`.
 */
function normalizeRemote(project, config) {
  const p = project || {}
  const milestones = Array.isArray(p.milestones) ? p.milestones : []
  const stateName = remoteStateName(p)
  const extracted = {
    description: p.description != null ? canonicalizeMarkdown(p.description) : null,
    milestones: milestones.map((m) => ({
      name: m.name,
      status: remoteMilestoneStatus(m),
    })),
    phaseBodies: milestones.map((m) => ({
      phase: m.name,
      goal: (m.description != null ? m.description : '').trim(),
    })),
    acceptanceCriteria: p.acceptanceCriteria != null ? p.acceptanceCriteria : null,
    taskBreakdown: milestones.map((m) => ({
      phase: m.name,
      tasks: Array.isArray(m.tasks) ? m.tasks : [],
    })),
    workflowState: stateName != null ? bucketForState(stateName, config) : null,
    priority: remotePriority(p.priority),
    labels: remoteLabels(p.labels),
  }
  return toFieldSet(extracted, config)
}

module.exports = {
  normalizeLocal,
  normalizeRemote,
  readSnapshot,
  parseFrontmatter,
  parseSections,
  parsePhaseIndex,
  canonicalRemoteStatus,
  canonicalizeMarkdown,
  bucketForState,
}
