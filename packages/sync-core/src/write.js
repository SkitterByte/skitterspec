'use strict'

/**
 * Local snapshot writes for pull (remote → repo).
 *
 * Phase 2 applies **frontmatter-mapped** pulled fields — the `pull`-owned data
 * remote genuinely owns (`workflowState` → `spec_status`, `priority`, `labels`)
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

// --- phase-file denormalizer (keyed milestone pull) ------------------------
//
// Writes pulled milestone edits back into the *body* — the phase files — which
// the frontmatter writer above never touches. An edit updates the matching phase
// file (by its linear_milestone_id) in place, leaving everything else
// byte-untouched; a Linear-only milestone becomes a new phase file. Removals are
// never applied here (report-only, Decision 7).

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

// The linear_milestone_id recorded in a phase file's frontmatter, or null.
function phaseMilestoneId(raw) {
  const { fmLines } = splitFrontmatter(raw)
  for (const line of fmLines) {
    const m = /^linear_milestone_id:\s*(.*)$/.exec(line)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '') || null
  }
  return null
}

// Find the phase file linked to a milestone id, or null.
function findPhaseFileByMilestoneId(snapshotDir, id) {
  const want = String(id)
  for (const file of listPhaseFiles(snapshotDir)) {
    const raw = fs.readFileSync(path.join(snapshotDir, file), 'utf-8')
    if (phaseMilestoneId(raw) === want) return file
  }
  return null
}

// Find the phase file whose h1 title matches `name` (used to link a freshly
// created milestone back to the phase it came from, before it has an id).
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

// Update a phase file's title (h1, preserving the "Phase N — " prefix + status
// emoji) and its `**Goal:**` line, leaving everything else untouched.
function writeMilestoneFields(snapshotDir, file, { name, goal }) {
  const p = path.join(snapshotDir, file)
  let raw = fs.readFileSync(p, 'utf-8')
  if (name != null) {
    raw = raw.replace(/^(#[ \t]+)(.*)$/m, (_full, hash, rest) => {
      const pm = /^(Phase\s+\d+\s*[—–-]\s*)(.*?)(\s*[⬜🔄✅])?\s*$/.exec(rest)
      return pm ? `${hash}${pm[1]}${name}${pm[3] || ''}` : `${hash}${name}`
    })
  }
  if (goal != null && /^\*\*Goal:\*\*/m.test(raw)) {
    raw = raw.replace(/^(\*\*Goal:\*\*[ \t]*).*$/m, `$1${goal}`)
  }
  fs.writeFileSync(p, raw, 'utf-8')
}

// Add/update linear_milestone_id in a phase file's frontmatter (in place).
function stampMilestoneId(snapshotDir, file, id) {
  const p = path.join(snapshotDir, file)
  const raw = fs.readFileSync(p, 'utf-8')
  const { fmLines, body, had } = splitFrontmatter(raw)
  const patched = patchFrontmatterLines(fmLines, { linear_milestone_id: String(id) })
  const fm = `---\n${patched.join('\n')}\n---\n`
  fs.writeFileSync(p, had ? fm + body : fm + '\n' + raw, 'utf-8')
}

const slugify = (name) =>
  String(name || 'phase')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'phase'

// Next phase number (max existing + 1).
function nextPhaseNumber(snapshotDir) {
  const nums = listPhaseFiles(snapshotDir)
    .map((f) => parseInt(f.slice(0, 2), 10))
    .filter(Number.isFinite)
  return nums.length ? Math.max(...nums) + 1 : 1
}

// Create a new phase file for a Linear-only milestone. Returns the filename.
function createPhaseFileForMilestone(snapshotDir, { id, name, goal }) {
  const n = nextPhaseNumber(snapshotDir)
  const file = `${String(n).padStart(2, '0')}-${slugify(name)}.md`
  const content =
    `---\nlinear_milestone_id: ${JSON.stringify(String(id))}\n---\n\n` +
    `# Phase ${n} — ${name || 'Untitled'} ⬜\n\n` +
    `> Spec: [00-overview.md](00-overview.md) · **Status:** Not started\n\n` +
    `**Goal:** ${goal || ''}\n\n## Tasks\n\n- [ ] (pulled from Linear — flesh out)\n`
  fs.writeFileSync(path.join(snapshotDir, file), content, 'utf-8')
  return file
}

/**
 * Apply a pull's keyed milestone item outcomes to the phase files.
 * @param items classifyItems output for the milestones field.
 * @returns { applied:string[], created:Array<{id,file}>, reported:string[] }
 */
function applyMilestonesPull(snapshotDir, items) {
  const applied = []
  const created = []
  const reported = []
  for (const it of items || []) {
    if (it.report) {
      reported.push(it.id)
      continue
    }
    if (!it.pullable || !it.remote) continue
    if (it.status === 'added') {
      const file = createPhaseFileForMilestone(snapshotDir, it.remote)
      created.push({ id: it.id, file })
    } else if (it.status === 'edited' || it.status === 'conflict') {
      const file = findPhaseFileByMilestoneId(snapshotDir, it.id)
      if (file) {
        writeMilestoneFields(snapshotDir, file, it.remote)
        applied.push(it.id)
      }
    }
  }
  return { applied, created, reported }
}

// --- task-line denormalizer (keyed issue pull) -----------------------------
//
// Tasks live as checkbox lines inside phase files. A pulled issue edit rewrites
// the matching line (by its inline id) in place; a Linear-only issue appends a
// new task line; a created issue's id is stamped inline. Removals report-only.

const TASK_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*)$/
const INLINE_ID_RE = /\s*\(([A-Za-z][A-Za-z0-9]*-\d+)\)\s*$/

// Render a task line from an item.
function taskLine(indent, { id, text, done }) {
  return `${indent}- [${done ? 'x' : ' '}] ${text}${id ? ` (${id})` : ''}`
}

// Update the task line carrying inline id `id` (text + checkbox), in place.
function updateTaskLine(snapshotDir, id, { text, done }) {
  const want = String(id)
  for (const file of listPhaseFiles(snapshotDir)) {
    const p = path.join(snapshotDir, file)
    const lines = fs.readFileSync(p, 'utf-8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = TASK_RE.exec(lines[i])
      if (!m) continue
      const idm = INLINE_ID_RE.exec(m[3])
      if (idm && idm[1] === want) {
        lines[i] = taskLine(m[1], { id: want, text, done })
        fs.writeFileSync(p, lines.join('\n'), 'utf-8')
        return true
      }
    }
  }
  return false
}

// Append a task line for a Linear-only issue after the last existing task line
// (falls back to end of the last phase file). Returns the file it landed in.
function addTaskLine(snapshotDir, item) {
  const files = listPhaseFiles(snapshotDir)
  const file = files[files.length - 1]
  if (!file) return null
  const p = path.join(snapshotDir, file)
  const lines = fs.readFileSync(p, 'utf-8').split('\n')
  let lastTask = -1
  for (let i = 0; i < lines.length; i++) if (TASK_RE.test(lines[i])) lastTask = i
  const line = taskLine('', item)
  if (lastTask >= 0) lines.splice(lastTask + 1, 0, line)
  else lines.push(line)
  fs.writeFileSync(p, lines.join('\n'), 'utf-8')
  return file
}

// Stamp an inline id onto the (idless) task line whose text matches — used after
// the skill creates an issue for a new local task.
function stampIssueId(snapshotDir, text, id) {
  const want = String(text).trim()
  for (const file of listPhaseFiles(snapshotDir)) {
    const p = path.join(snapshotDir, file)
    const lines = fs.readFileSync(p, 'utf-8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = TASK_RE.exec(lines[i])
      if (!m || INLINE_ID_RE.test(m[3])) continue
      if (m[3].trim() === want) {
        lines[i] = `${m[1]}- [${m[2].toLowerCase() === 'x' ? 'x' : ' '}] ${want} (${id})`
        fs.writeFileSync(p, lines.join('\n'), 'utf-8')
        return file
      }
    }
  }
  return null
}

/**
 * Apply a pull's keyed task item outcomes to the phase files' task lines.
 * @returns { applied:string[], created:Array<{id,file}>, reported:string[] }
 */
function applyTasksPull(snapshotDir, items) {
  const applied = []
  const created = []
  const reported = []
  for (const it of items || []) {
    if (it.report) {
      reported.push(it.id)
      continue
    }
    if (!it.pullable || !it.remote) continue
    if (it.status === 'added') {
      const file = addTaskLine(snapshotDir, it.remote)
      if (file) created.push({ id: it.id, file })
    } else if (it.status === 'edited' || it.status === 'conflict') {
      if (updateTaskLine(snapshotDir, it.id, it.remote)) applied.push(it.id)
    }
  }
  return { applied, created, reported }
}

module.exports = {
  writeFrontmatter,
  splitFrontmatter,
  serialize,
  listPhaseFiles,
  findPhaseFileByMilestoneId,
  findPhaseFileByTitle,
  writeMilestoneFields,
  stampMilestoneId,
  createPhaseFileForMilestone,
  applyMilestonesPull,
  updateTaskLine,
  addTaskLine,
  stampIssueId,
  applyTasksPull,
}
