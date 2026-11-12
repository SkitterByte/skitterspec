'use strict'

/**
 * Claude Code's session transcripts, read down to what a ta-da list needs:
 * which prompts a person typed, where they were standing (cwd + git branch),
 * and when. Everything else — tool calls, tool results, reminders, caveats —
 * is dropped here, so the model is handed a digest and never a transcript.
 *
 * WHAT WOULD FOOL THIS: the transcript format is Claude Code's, not ours, and
 * nothing promises it stays put. A renamed field would read as a day with no
 * activity — an absence that proves nothing. So a file touched inside the
 * window that yields no readable entry is reported as `cannot tell`, never
 * silently as an idle day (`.claude/rules/negative-checks.md`).
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

// Enough to recognise a prompt, short enough that a long day stays a digest.
const PROMPT_CHARS = 200
// Per session and place: the first few say what it set out to do, the last
// few where it ended up. The middle is counted, not shown.
const KEEP_HEAD = 3
const KEEP_TAIL = 3

// Built-in commands that move the session around rather than do work. Kept out
// so a recap is not half `/clear`; a skill's command is work and stays.
const HOUSEKEEPING = new Set([
  'add-dir', 'clear', 'compact', 'config', 'context', 'cost', 'doctor', 'exit', 'fast',
  'help', 'login', 'logout', 'memory', 'model', 'permissions', 'quit', 'resume', 'status',
])

/** Where Claude Code keeps transcripts — `CLAUDE_CONFIG_DIR` moves it. */
function defaultRoot(env = process.env) {
  const base = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(base, 'projects')
}

/**
 * Every `<root>/<project>/<session>.jsonl` modified at or after `since`. A file
 * last written before the window opened cannot hold an entry inside it, so
 * this is a skip and not a guess. Subagent transcripts live a level deeper and
 * are deliberately not read: their prompts were written by Claude, not typed.
 */
function listTranscripts(root, since) {
  let projects
  try {
    projects = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const p of projects) {
    if (!p.isDirectory()) continue
    const dir = path.join(root, p.name)
    let files
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue
      const file = path.join(dir, f)
      let stat
      try {
        stat = fs.statSync(file)
      } catch {
        continue
      }
      if (stat.isFile() && stat.mtime >= since) out.push(file)
    }
  }
  return out.sort()
}

/**
 * What a user entry says, reduced to one of:
 *   { text }            a prompt someone typed
 *   { command, text }   a slash command, kept as an event (`/spec-next`)
 *   null                noise — dropped
 */
function readPrompt(content) {
  if (typeof content !== 'string') return null // tool results, images
  const s = content.trim()
  if (!s) return null
  const name = /<command-name>\s*([^<\s]+)\s*<\/command-name>/.exec(s)
  if (name) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(s)
    const command = name[1].startsWith('/') ? name[1] : `/${name[1]}`
    if (HOUSEKEEPING.has(command.slice(1))) return null
    return { command, text: cap(args ? args[1].trim() : '') }
  }
  // Caveats, command output, reminders, task notifications, a bare paste:
  // all arrive as a tagged block, and none of them is something typed.
  if (s.startsWith('<')) return null
  // "[Request interrupted by user]" and its kind.
  if (s.startsWith('[') && s.endsWith(']')) return null
  return { text: cap(s) }
}

function cap(s) {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > PROMPT_CHARS ? `${one.slice(0, PROMPT_CHARS - 1)}…` : one
}

/**
 * One transcript, read inside the window. Prompts are attributed to where the
 * session stood when they were typed — a session that `cd`s into a worktree
 * half-way through contributes to two places, which is the point.
 *
 * @returns {Promise<{ id, stamped: number, places: Array<{ cwd, branch,
 *   start, end, prompts: Array<{ at, text, command? }> }> }>}
 */
async function readSession(file, { since, until }) {
  const id = path.basename(file, '.jsonl')
  const places = new Map()
  let cwd = null
  let branch = null
  // Entries carrying a timestamp we could parse, inside the window or not —
  // the positive signal that this is still a format we can read.
  let stamped = 0

  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue // a half-written last line, or not ours to read
    }
    // Where the session stands is tracked from every entry, so a `cd` made by
    // a tool call moves the prompts that follow it.
    if (typeof e.cwd === 'string') cwd = e.cwd
    if (typeof e.gitBranch === 'string' && e.gitBranch) branch = e.gitBranch
    const at = Date.parse(e.timestamp)
    if (Number.isNaN(at)) continue
    stamped++
    if (at < since.getTime() || at > until.getTime()) continue
    // A compaction summary arrives as a user entry, written by Claude.
    if (e.type !== 'user' || e.isMeta || e.isSidechain || e.isCompactSummary) continue
    const p = readPrompt(e.message && e.message.content)
    if (!p || !cwd) continue
    const key = `${cwd}\0${branch || ''}`
    if (!places.has(key)) places.set(key, { cwd, branch, start: e.timestamp, end: e.timestamp, prompts: [] })
    const place = places.get(key)
    place.end = e.timestamp
    place.prompts.push({ at: e.timestamp, ...p })
  }
  return { id, stamped, launch: launchDir(path.basename(path.dirname(file))), places: [...places.values()] }
}

/**
 * The directory a session was launched from, read back off its transcript
 * folder's name — Claude Code writes `/Users/me/code/app` as
 * `-Users-me-code-app`, flattening `/` and `.` alike to `-`.
 *
 * That flattening is lossy (`my-app` and `my/app` encode the same), so this
 * decodes only by asking the disk: each `-` is tried as a separator and as a
 * literal, keeping the spellings that exist. More than one survivor, or none,
 * is cannot-tell and returns null — a guessed directory would fold a session
 * into the wrong repo with nothing to show for it.
 */
function launchDir(name, existsOnDisk = fs.existsSync) {
  // A leading `-` is a POSIX root, so it decodes with POSIX separators on any
  // platform — `path.join` on Windows would turn `/Users/me` into `\\Users\\me`.
  // A Windows folder (`C--Users-me`) starts with its drive and is cannot-tell.
  if (!name.startsWith('-')) return null
  const { join } = path.posix
  const parts = name.slice(1).split('-')
  // Each `-` has three readings, so the search is exponential in their count;
  // past this many it is cannot-tell rather than a stall.
  if (parts.length > 16) return null
  const seen = new Map()
  const exists = (p) => {
    if (!seen.has(p)) seen.set(p, existsOnDisk(p))
    return seen.get(p)
  }
  const found = []
  const walk = (i, at, seg) => {
    if (found.length > 1) return
    if (i === parts.length) {
      const full = join(at, seg)
      if (exists(full)) found.push(full)
      return
    }
    const next = parts[i]
    // Close the segment here, if what it names exists so far.
    if (seg && exists(join(at, seg))) walk(i + 1, join(at, seg), next)
    // Or keep it open, through a literal `-` or a `.` (a dotfile, `app.web`).
    if (seg !== '') {
      walk(i + 1, at, `${seg}-${next}`)
      walk(i + 1, at, `${seg}.${next}`)
    } else {
      walk(i + 1, at, `.${next}`)
    }
  }
  walk(1, '/', parts[0])
  return found.length === 1 ? found[0] : null
}

/** First and last few prompts, with the middle counted rather than shown. */
function trimPrompts(prompts) {
  if (prompts.length <= KEEP_HEAD + KEEP_TAIL) return { prompts, omitted: 0 }
  return {
    prompts: [...prompts.slice(0, KEEP_HEAD), ...prompts.slice(-KEEP_TAIL)],
    omitted: prompts.length - KEEP_HEAD - KEEP_TAIL,
  }
}

// Enough of a transcript to see where its session ran. A session's first
// entries carry its cwd; reading the whole file to learn that is how listing
// every project would cost a minute.
const HEAD_BYTES = 64 * 1024

/**
 * Every directory any session ran in — read from the head of each transcript,
 * plus the folder each session was launched from. All time, not a window: this
 * answers "which projects do you work in", for `skitterspec project
 * --categories`. Resolving them to repos is the caller's.
 */
function knownDirs(root) {
  const dirs = new Set()
  for (const file of listTranscripts(root, new Date(0))) {
    const launch = launchDir(path.basename(path.dirname(file)))
    if (launch) dirs.add(launch)
    let head = ''
    try {
      const fd = fs.openSync(file, 'r')
      const buf = Buffer.alloc(HEAD_BYTES)
      const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0)
      fs.closeSync(fd)
      head = buf.subarray(0, n).toString('utf8')
    } catch {
      continue
    }
    for (const m of head.matchAll(/"cwd":"((?:[^"\\]|\\.)*)"/g)) {
      try {
        dirs.add(JSON.parse(`"${m[1]}"`))
      } catch {
        // a cwd cut off at the head's edge — the next line will carry it
      }
    }
  }
  return [...dirs]
}

module.exports = {
  defaultRoot,
  knownDirs,
  launchDir,
  listTranscripts,
  readPrompt,
  readSession,
  trimPrompts,
  PROMPT_CHARS,
  KEEP_HEAD,
  KEEP_TAIL,
}
