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
const { fenceMask, findTaskBlocks, collapse, collapseHyphenAware } = require('./task-block.js')

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
  const inFence = fenceMask(lines)
  let title = null
  const sections = {}
  let current = null
  let buf = []
  const flush = () => {
    if (current !== null) sections[current] = buf.join('\n').trim()
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // A `#`/`##` inside a fenced code block is example text, not a real heading —
    // treat it as body content so it can't start a phantom section.
    const h1 = inFence[i] ? null : /^#\s+(.*)$/.exec(line)
    const h2 = inFence[i] ? null : /^##\s+(.*)$/.exec(line)
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

// Linear mangles inline emphasis whose markers straddle a hard line break: it
// terminates the run at end-of-line and restarts it at the next, so `**a\nb**`
// comes back as `**a****\n****b**`, `*a\nb*` as `*a**\n**b*`, and a link splits
// into two. Canonicalise BOTH representations — the clean straddle we author and
// the mangled form Linear returns — to the same single-line span, so an
// already-mangled remote stops reading as a spurious `remote-only` diff and the
// payload we push carries no straddle for Linear to mangle again. Idempotent: a
// joined span has no interior newline, so nothing re-fires. Repo files are never
// rewritten — this only shapes the normalized projection the compare/push see.
function joinEmphasisAcrossBreaks(text) {
  let s = String(text)
  // (1) Repair Linear's mangle artifacts first — an emphasis run terminated at
  // end-of-line and restarted at the next. These are very specific asterisk runs
  // flanking a break, so a targeted regex is safe:
  //   bold:   `**X****\n****Y**` → the `****\n****` empty-bold artifact → a space.
  s = s.replace(/\*{4}[ \t]*\n[ \t]*\*{4}/g, ' ')
  //   italic: `*X**\n**Y*` — the `**\n**` artifact sits INSIDE a single-`*` span;
  //   gate on the enclosing single `*` so a genuine pair of adjacent bolds at a
  //   line boundary (`a**\n**b`) is left alone.
  s = s.replace(/(^|[^*\n])\*([^*\n]+)\*\*[ \t]*\n[ \t]*\*\*([^*\n]+)\*(?![*])/g, '$1*$2 $3*')
  //   link split across a break onto the same url → one link.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)[ \t]*\n[ \t]*\[([^\]]+)\]\(\2\)/g, '[$1 $3]($2)')
  // (2) Join the clean straddle we author — a newline that falls while an
  // emphasis/link span is OPEN. A scanner (not a regex) so an opening `**` is
  // never mis-paired with an unrelated closing `**` on the next line, and markers
  // inside a `code span` are ignored (Linear only rejoins those, harmlessly).
  return joinOpenSpans(s)
}

// Walk the text tracking whether we're inside a `**bold**`, `*italic*`, `[link
// text]`/`(url)`, or `` `code` `` span. A newline encountered while a
// non-code span is open joins the two lines with a single space (dropping the
// next line's indentation); every other newline is preserved.
function joinOpenSpans(text) {
  const out = []
  let bold = false
  let italic = false
  let code = false
  let link = 0 // 0 none · 1 in link text · 2 in url
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\n') {
      if (!code && (bold || italic || link)) {
        // Skip the continuation's indentation AND any blockquote marker (`>`) —
        // a span wrapped across two `> …` lines is one quoted run, so the join
        // must drop the continuation `>` rather than swallow it into the text.
        // Then join: a word wrapped at a hyphen (`state-entry-with-`⏎`assignment`)
        // is one compound — join TIGHT (no space); otherwise a single space.
        let j = i + 1
        while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '>')) j++
        const softHyphen = text[i - 1] === '-' && /\w/.test(text[i - 2] || '') && /\w/.test(text[j] || '')
        if (!softHyphen) out.push(' ')
        i = j - 1
      } else {
        out.push('\n')
      }
      continue
    }
    if (c === '`') {
      code = !code
      out.push(c)
      continue
    }
    if (code) {
      out.push(c)
      continue
    }
    if (c === '*' && text[i + 1] === '*') {
      bold = !bold
      out.push('**')
      i++
      continue
    }
    if (c === '*') {
      // Basic flanking so a stray `*` (e.g. `2 * 3`) doesn't open a phantom span:
      // an opener needs a non-space to its right, a closer a non-space to its left.
      const ok = italic ? !/\s/.test(text[i - 1] || '') : !/\s/.test(text[i + 1] || '')
      if (ok) italic = !italic
      out.push(c)
      continue
    }
    if (c === '[' && link === 0) {
      link = 1
      out.push(c)
      continue
    }
    if (c === ']' && link === 1) {
      if (text[i + 1] === '(') {
        link = 2
        out.push('](')
        i++
      } else {
        link = 0
        out.push(c)
      }
      continue
    }
    if (c === ')' && link === 2) {
      link = 0
      out.push(c)
      continue
    }
    out.push(c)
  }
  return out.join('')
}

// Canonicalise markdown so semantically-equal content hashes equal across the
// boundary. Linear reserializes markdown on save (authored `-` bullets come back
// as `*`, trailing whitespace trimmed, blank runs collapsed, emphasis spanning a
// line break mangled), so without this a clean push→pull would report
// `description` as perpetually changed. Applied to the description on BOTH sides.
// Conservative: only unifies list markers, whitespace, and emphasis-across-a-break
// — the transforms actually observed from Linear.
function canonicalizeMarkdown(text) {
  if (text == null) return text
  const marked = String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    // Unordered-list marker at line start (`*`/`+`/`-`) → `-`. Requires a space
    // after the marker so bold/emphasis (`**Goal:**`) is untouched. Done BEFORE
    // the emphasis join so a `*` list bullet can't spoof an italic delimiter.
    .map((line) => line.replace(/^(\s*)[*+-]( +)/, '$1-$2').replace(/[ \t]+$/, ''))
    .join('\n')
  return joinEmphasisAcrossBreaks(marked)
    // A word wrapped at a hyphen within a paragraph (`state-entry-with-`⏎
    // `assignment`) rejoins TIGHT — otherwise Linear (CommonMark) renders the
    // soft line break as a space and corrupts the compound. Single newline only,
    // so paragraph breaks are preserved.
    .replace(/(\w-)[ \t]*\n[ \t]*(?=\w)/g, '$1')
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

// The phase's descriptive title: the h1 with the "Phase N — " prefix and any
// trailing status emoji stripped (so it matches its Linear Milestone name).
function phaseTitle(body) {
  const h1 = /^#\s+(.*)$/m.exec(body)
  if (!h1) return null
  const t = h1[1]
    .replace(/\s*[⬜🔄✅]\s*$/u, '')
    .replace(/^Phase\s+\d+\s*[—–-]\s*/i, '')
    .trim()
  return t || null
}

// The raw ⬜/🔄/✅ on a phase file's h1, or undefined when it carries none.
// Kept separate from `phaseStateBucket` because the LINT has to tell "absent"
// apart from "not-started" — the projection deliberately cannot (see below).
function headingEmoji(body) {
  const h1 = /^#\s+(.*)$/m.exec(body)
  return h1 ? (h1[1].match(/[⬜🔄✅]/u) || [])[0] : undefined
}

// The `> **Status:** …` line's value, or null when the file has none. This is
// the human mirror of the heading emoji, not a source of truth — `lintPhases`
// cross-checks it, and nothing else reads it.
function phaseStatusLine(body) {
  const m = /^>.*\*\*Status:\*\*\s*(.+?)\s*$/m.exec(body)
  return m ? m[1] : null
}

// Read a `> **Status:**` value leniently into the canonical vocabulary: an emoji
// if it carries one, else a word we recognise. Returns null for anything else —
// the line is free prose, and warning on an unrecognised phrasing would train
// the warning away.
// `pending` is deliberately NOT here: "pending review" matches as not-started
// but means roughly the opposite, and a false positive is worse than a missed
// check — it teaches the reader to ignore the warning.
const STATUS_WORDS = [
  [/\b(not[\s-]?started|todo|to[\s-]do|planned)\b/i, 'not-started'],
  [/\b(in[\s-]?progress|started|doing|wip)\b/i, 'in-progress'],
  [/\b(done|complete[d]?|finished|shipped)\b/i, 'done'],
]
function statusLineValue(line) {
  if (!line) return null
  const emoji = (line.match(/[⬜🔄✅]/u) || [])[0]
  if (emoji) return EMOJI_STATUS[emoji]
  for (const [re, status] of STATUS_WORDS) if (re.test(line)) return status
  return null
}

// A phase's status (from its heading emoji ⬜/🔄/✅) mapped to a state bucket the
// `states` table understands, so a sub-issue lands in the matching Linear issue
// state. Unknown/absent → backlog.
//
// That fallback conflates "author marked it not-started" with "author used a
// format we don't parse", which is silent corruption: the wrong state pushes
// cleanly and `record` then commits it as the INTENDED value. The fix is not
// leniency here — one convention beats two — it is `lintPhases`, which warns.
const PHASE_STATE_BUCKET = { 'not-started': 'backlog', 'in-progress': 'in-progress', done: 'complete' }
function phaseStateBucket(body) {
  return PHASE_STATE_BUCKET[EMOJI_STATUS[headingEmoji(body)]] || 'backlog'
}

// Parse a task line (already stripped of its leading "- ") into a keyed item:
// its checkbox state, its text, and the inline Linear issue identifier if present
// (`… (SKI-123)`). Returns null for a non-task line.
function parseTaskLine(line) {
  const m = /^\[([ xX])\]\s*(.*)$/.exec(line)
  if (!m) return null
  const done = m[1].toLowerCase() === 'x'
  let text = m[2].trim()
  let id = null
  const idm = /\s*\(([A-Za-z][A-Za-z0-9]*-\d+)\)\s*$/.exec(text)
  if (idm) {
    id = idm[1]
    text = text.slice(0, idm.index).trim()
  }
  return { id, text, done }
}

// Read the phase files (01-*.md, 02-*.md …) in execution order. Each yields its
// linked milestone id (from optional frontmatter), title, goal and tasks.
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
      const { data, body } = parseFrontmatter(raw)
      // No /m on either: under /m, `$` matches end-of-LINE, so a non-greedy
      // scan stops at the first newline and a hand-wrapped bullet or goal loses
      // every continuation line. Tasks come from findTaskBlocks, which reads a
      // wrapped bullet as one logical task.
      // Collapsed, not just captured: the goal becomes a milestone description,
      // and Linear may canonicalize a soft line break away on save. Collapsing
      // both sides keeps a wrapped goal from diffing forever.
      const goal = collapseHyphenAware((/\*\*Goal:\*\*\s*([\s\S]*?)(?:\n\n|$)/.exec(body) || [])[1] || '')
      // Rendered as markdown checklist lines, ready to drop into a sub-issue
      // description: indentation kept so nesting survives, each bullet keeping
      // the marker its author wrote, and any inline `(KEY-123)` stamped on a legacy task
      // line stripped — those ids were per-task issues we no longer create, and
      // they read as noise in the mirror.
      const tasks = findTaskBlocks(body.split('\n')).map((b) => {
        // `findTaskBlocks` also returns the plain sub-bullets written underneath
        // a task. They carry no checkbox, so they render as the bullet their
        // author used — emitting `- [ ]` here would invent a task that does not
        // exist in the repo.
        const parsed = parseTaskLine(`[${b.checkbox ? b.mark : ' '}] ${b.text}`)
        const text = parsed ? parsed.text : b.text
        return b.checkbox ? `${b.indent}- [${b.mark}] ${text}` : `${b.indent}${b.marker} ${text}`
      })
      return {
        phase: file.replace(/\.md$/, ''),
        file,
        // The sub-issue id, stamped back into the phase file on first push.
        id: data.linear_issue_id != null ? String(data.linear_issue_id) : null,
        name: phaseTitle(body),
        goal: goal.trim(),
        state: phaseStateBucket(body),
        // Lint-only signals. `emoji` is undefined when the heading carries none
        // — the distinction `state` throws away; `statusLine` is the raw
        // `> **Status:**` value. Neither affects the projection.
        emoji: headingEmoji(body),
        statusLine: phaseStatusLine(body),
        tasks,
      }
    })
}

// --- phase-status lint ------------------------------------------------------

/**
 * Warn where a phase's status signals are absent or disagree.
 *
 * A spec carries the same status in three places — the phase file's h1 emoji,
 * its `> **Status:**` line, and the `00-overview.md` phase-index row — and only
 * the h1 is load-bearing. Writing the other two correctly while leaving the h1
 * bare projects a finished phase as `backlog`, pushes cleanly, and records the
 * wrong value as intended. Nothing looks wrong anywhere.
 *
 * Returns `[{ file, code, message }]`, `code` being `missing-status-emoji` or
 * `status-disagreement`. Pure aside from reads; callers decide how loud to be
 * (today: printed, never fatal).
 */
function lintPhases(snapshotDir, config) {
  const phases = readPhaseFiles(snapshotDir)
  if (!phases.length) return []

  // The overview may be absent (a legacy bare `<name>.md` spec) — that is not
  // itself a lint failure, it just removes one of the three cross-checks.
  let indexRows = []
  try {
    const overviewFile = (config && config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
    const raw = fs.readFileSync(path.join(snapshotDir, overviewFile), 'utf-8')
    const { sections } = parseSections(parseFrontmatter(raw).body)
    indexRows = parsePhaseIndex(sections.Phases)
  } catch {
    indexRows = []
  }

  const warnings = []
  phases.forEach((phase, i) => {
    if (!phase.emoji) {
      warnings.push({
        file: phase.file,
        code: 'missing-status-emoji',
        message: `no ⬜/🔄/✅ in the heading — projecting as not-started`,
      })
      // Without a heading emoji there is nothing to disagree WITH: the other two
      // signals can't be checked against a value that was never expressed.
      return
    }

    const heading = EMOJI_STATUS[phase.emoji]

    const fromLine = statusLineValue(phase.statusLine)
    if (fromLine && fromLine !== heading) {
      warnings.push({
        file: phase.file,
        code: 'status-disagreement',
        message: `heading says ${heading} but its Status line says ${fromLine}`,
      })
    }

    // Match the index row by phase title, falling back to position — a renamed
    // phase shouldn't silently drop the check.
    const row = indexRows.find((r) => r.name === phase.name) || indexRows[i]
    if (row && row.status !== heading) {
      warnings.push({
        file: phase.file,
        code: 'status-disagreement',
        message: `heading says ${heading} but the overview phase-index row says ${row.status}`,
      })
    }
  })
  return warnings
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
// removed. Keeps the title line for context. `extraSkip` drops additional
// sections (e.g. "Phases" once milestones sync as first-class Linear objects, so
// the phase list isn't duplicated in the description — Decision 5).
function buildDescription(title, sections, localOnlySections, extraSkip = []) {
  const skip = new Set([...(localOnlySections || []), ...extraSkip])
  const parts = []
  if (title) parts.push(`# ${title}`)
  for (const [heading, content] of Object.entries(sections)) {
    if (skip.has(heading)) continue
    parts.push(`## ${heading}\n\n${content}`.trim())
  }
  return canonicalizeMarkdown(parts.join('\n\n')) || null
}

// A phase sub-issue's description: its `**Goal:**` line, plus the phase's task
// list as a markdown checklist when `mapping.tasks` is `checklist`.
//
// The checklist is a READ-ONLY mirror like everything else here — the repo is
// the source of truth, so a box ticked in the tracker is overwritten on the next
// push. Without it a sub-issue is a title and one sentence, which is too thin to
// act on; with it the phase is legible to someone working in the tracker without
// tasks becoming individually-synced objects again.
function subIssueBody(phase, tasksMode) {
  if (tasksMode !== 'checklist' || !phase.tasks.length) return phase.goal
  const parts = []
  if (phase.goal) parts.push(phase.goal, '')
  parts.push('## Tasks', '', ...phase.tasks)
  return parts.join('\n')
}

/**
 * Normalize a local spec snapshot into the configured field set.
 */
// The spec's lifecycle bucket from its folder — the source of truth for status
// (specs live in specs/<bucket>/<name>/). Maps directly to a `states` key.
const LIFECYCLE_BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']
function bucketFromPath(snapshotDir) {
  const parent = path.basename(path.dirname(snapshotDir))
  return LIFECYCLE_BUCKETS.includes(parent) ? parent : null
}

function normalizeLocal(snapshotDir, config) {
  const { frontmatter, title, sections, phases } = readSnapshot(snapshotDir, config)
  // Phases sync as sub-issues whenever `subIssues` is in the pushed projection,
  // so strip the `## Phases` index from the description to avoid duplicating it
  // (as prose AND as sub-issues) in the Linear mirror.
  const phasesProjected = !!(config.sync.fieldOwnership && 'subIssues' in config.sync.fieldOwnership)
  const tasksMode = (config.mapping && config.mapping.tasks) || 'checklist'
  const extracted = {
    description: buildDescription(
      title,
      sections,
      config.sync.localOnlySections,
      phasesProjected ? ['Phases'] : [],
    ),
    // Sub-issue projection: one per phase. `ref` is the phase-file basename — the
    // local handle the push skill stamps a newly-created sub-issue id back into.
    // `state` is the phase's status bucket (from its heading emoji), mapped to a
    // Linear issue state via `config.states` at push time. Tasks ride along in
    // the description as a read-only checklist (`mapping.tasks`), never as
    // individually-synced objects.
    subIssues: phases
      .filter((p) => p.name)
      .map((p) => ({ id: p.id, ref: p.phase, name: p.name, goal: subIssueBody(p, tasksMode), state: p.state })),
    // Status is the spec's lifecycle bucket. The folder is the source of truth;
    // an explicit `spec_status` frontmatter key overrides it if present.
    workflowState:
      frontmatter.spec_status != null ? String(frontmatter.spec_status) : bucketFromPath(snapshotDir),
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

// The real Linear issue carries its workflow state in `state` (an object
// `{ name, type }`); accept `status` / a bare string too for robustness.
function remoteStateName(issue) {
  const st = issue.state != null ? issue.state : issue.status
  if (st == null) return null
  if (typeof st === 'object') return st.name != null ? st.name : st.type != null ? st.type : null
  return st
}

// The ONE thing one-way sync reads back: the mirror issue's current workflow
// state, mapped to the local lifecycle bucket, so `/spec-status` can report a
// drift ("Linear says Done, your spec says In Progress"). Read-only — never writes.
function remoteWorkflowState(issue, config) {
  const name = remoteStateName(issue || {})
  return name != null ? bucketForState(name, config) : null
}

// A Linear issue title is plain text, so markdown emphasis is noise there — and
// worse, an emphasis run cut mid-title (or a bold LABEL like `**1. Foo**`) can
// leave a dangling `**`. Strip `*` emphasis markers and unwrap `[text](url)` to
// `text`. Backticks and `_` are KEPT: task labels lean on inline code
// (`` `DbFoo` ``) and identifiers use snake_case, and neither breaks a title.
function stripTitleMarkup(t) {
  return t
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/\*/g, '') // bold/italic markers (incl. a dangling ** from a cut)
    .replace(/\s+/g, ' ')
    .trim()
}

// Trim a trailing parenthetical whose opener has no matching close — so a cut
// title never ends on a dangling `(`/`[`.
function dropUnclosedBracket(t) {
  for (const [open, close] of [
    ['(', ')'],
    ['[', ']'],
  ]) {
    const o = t.lastIndexOf(open)
    if (o !== -1 && t.indexOf(close, o) === -1) t = t.slice(0, o)
  }
  return t
}

// Derive a short Linear issue title from a task's full text: the first sentence,
// falling back to the first `max` chars at a word boundary. A paragraph-length
// task keeps its full text as the issue *description* (see the projection); this
// is only the title, so it must read as a one-liner. Guards decimals/versions
// (`7.0.2`) and common abbreviations (`e.g.`, `i.e.`, `etc.`) so it doesn't cut
// mid-number or mid-abbreviation.
function titleFromText(text, max = 100) {
  const s = collapse(text)
  if (!s) return s
  let title = s
  const re = /[.!?]/g
  let m
  while ((m = re.exec(s)) !== null) {
    const i = m.index
    const after = s[i + 1]
    if (after !== undefined && !/\s/.test(after)) continue // not a sentence end
    if (/\d/.test(s[i - 1] || '') && /\d/.test(after || '')) continue // 7.0.2, 3.14
    if (/(?:^|[^\w])\d+$/.test(s.slice(0, i))) continue // list ordinal "1." "2."
    if (/(^|\s)(e\.g|i\.e|etc|vs|no|fig|cf)$/i.test(s.slice(0, i))) continue // abbrev
    title = s.slice(0, i) // drop the terminator
    break
  }
  title = title.trim()
  if (title.length > max) {
    const cut = title.slice(0, max)
    // Prefer the last clause boundary before the limit — a terminator/separator
    // to cut AFTER (`.`/`;`/`:`…) or a dash to cut BEFORE — over a bare word break.
    const minCut = Math.floor(max * 0.4)
    let boundary = -1
    let mm
    const after = /[.!?;:](?=\s|$)/g
    while ((mm = after.exec(cut)) !== null) boundary = Math.max(boundary, mm.index + 1)
    const before = /\s[—–]/g
    while ((mm = before.exec(cut)) !== null) boundary = Math.max(boundary, mm.index)
    let t
    if (boundary > minCut) {
      t = cut.slice(0, boundary)
    } else {
      const sp = cut.lastIndexOf(' ')
      t = sp > 40 ? cut.slice(0, sp) : cut
    }
    title = dropUnclosedBracket(t).replace(/[\s.,:;—–([]+$/, '').trim()
  }
  return stripTitleMarkup(title)
}

// Which configured state NAMES are absent from the live workspace. The skill
// fetches the workspace's project-status names over MCP and passes them here;
// a non-empty result means a typo/rename that Linear would silently no-op.
function validateStates(config, workspaceStates) {
  const configured = Object.values((config && config.states) || {}).filter((v) => typeof v === 'string')
  const have = new Set((workspaceStates || []).map((s) => String(s).toLowerCase().trim()))
  return configured.filter((name) => !have.has(name.toLowerCase().trim()))
}

module.exports = {
  normalizeLocal,
  lintPhases,
  readSnapshot,
  parseFrontmatter,
  parseSections,
  parsePhaseIndex,
  parseTaskLine,
  titleFromText,
  validateStates,
  canonicalRemoteStatus,
  canonicalizeMarkdown,
  joinEmphasisAcrossBreaks,
  bucketForState,
  remoteWorkflowState,
}
