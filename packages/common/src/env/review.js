'use strict'

/**
 * Collect a spec's diff and emit a self-contained review page.
 *
 * Everything here reads the spec's worktree with `git -C <worktreePath>` and
 * never changes directory or spawns anything inside it — the whole point of the
 * feature is that you review a worktree's work from wherever your shell already
 * is (usually the primary checkout, often a phone). The collector is pure apart
 * from the injected `git` runner; the output path and the clock come from the
 * caller so the page is deterministic under test.
 *
 * The diff data NEVER passes through a model: git writes the patches, this
 * module splices them into the page's JSON island as text. That is what makes a
 * 266KB patch cost nothing to produce.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// `-U` large enough that a file's patch IS the file. Reviewing a changed line
// needs the code around it, and this costs a git flag rather than a second read;
// the viewer collapses the unchanged runs back down.
const WHOLE_FILE_CONTEXT = 100000

// Past this, whole-file context is bloating the page rather than informing it —
// regenerate that one file at -U3 and say so. Deliberately a constant and NOT a
// config key: nobody is going to tune this, and an untuned key is a surface to
// document, validate and test for no gain.
const PATCH_LIMIT_BYTES = 400 * 1024

// Where the page lands by default. `.spec-env/` is gitignored by the installer,
// so a review is local, free and leaves no trace in the branch under review.
const REVIEW_DIR = path.join('.spec-env', 'reviews')

// Bookkeeping the viewer should collapse: the spec folders themselves and the
// push snapshot that lives among them. The ENGINE decides this, because it knows
// the spec's own paths — a viewer guessing from regexes would get it wrong the
// first time someone's product code lived under a folder called `specs`.
function isNoise(relPath) {
  return relPath.startsWith('specs/') || relPath.startsWith('.spec-env/')
}

/**
 * A git runner bound to one checkout, returning stdout **untrimmed**.
 *
 * The untrimmed part is load-bearing and is why this does not reuse the CLI's
 * `gitReader`: `git status --porcelain` puts a SPACE in the first column for an
 * unstaged change, so trimming the whole output shifts every path by one
 * character. (Found the hard way in the prototype.)
 *
 * A non-zero exit whose stdout is still useful is returned rather than thrown —
 * `git diff --no-index` exits 1 precisely when the files differ, which is the
 * case we call it for.
 */
function rawGitReader(worktreePath) {
  return (argv) => {
    try {
      return execFileSync('git', ['-C', worktreePath, ...argv], {
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      })
    } catch (err) {
      if (err && typeof err.stdout === 'string') return err.stdout
      if (err && err.stdout) return err.stdout.toString()
      return null
    }
  }
}

// Split output into lines WITHOUT trimming the lines themselves (see above).
// Only the trailing newline git always emits is dropped.
function lines(out) {
  if (!out) return []
  return out.replace(/\n$/, '').split('\n').filter((l) => l !== '')
}

// `--numstat` emits one row per file; we ask per-file, so take the FIRST line
// and split that — splitting the whole output merges a second file's counts into
// the first (the prototype's other bug). A binary file reports `-` for both.
function parseNumstat(out) {
  const first = lines(out)[0]
  if (!first) return { additions: 0, deletions: 0, binary: false }
  const [a, d] = first.split('\t')
  if (a === '-' || d === '-') return { additions: 0, deletions: 0, binary: true }
  return { additions: Number(a) || 0, deletions: Number(d) || 0, binary: false }
}

// Map a `--name-status` code to the status the viewer shows.
function statusFromCode(code) {
  const c = code[0]
  if (c === 'A') return 'new'
  if (c === 'D') return 'deleted'
  if (c === 'R') return 'renamed'
  if (c === 'C') return 'copied'
  return 'modified'
}

/**
 * The tracked files that changed between `ref` and the working tree, in git's
 * own order. `R`/`C` rows carry two paths (old, new) — the NEW path is the one
 * to diff and display, and the old one is kept so the viewer can say where it
 * came from.
 */
function trackedFiles(git, ref) {
  // Rename detection is git's default (diff.renames since 2.9) — left implicit
  // rather than forced, so a project that turns it off gets what it configured.
  const out = git(['diff', ref, '--name-status'])
  const rows = []
  for (const line of lines(out)) {
    const parts = line.split('\t')
    const code = parts[0]
    if (!code) continue
    if ((code[0] === 'R' || code[0] === 'C') && parts.length >= 3) {
      rows.push({ path: parts[2], from: parts[1], status: statusFromCode(code) })
    } else if (parts.length >= 2) {
      rows.push({ path: parts[1], from: null, status: statusFromCode(code) })
    }
  }
  return rows
}

/**
 * Untracked files, which `git diff` cannot see at all — a new test file would
 * otherwise be invisible, and that is the single most review-worthy thing a
 * phase produces. `-uall` lists them individually rather than collapsing a new
 * directory to one `dir/` row we would then have to walk ourselves.
 */
function untrackedFiles(git) {
  const out = git(['status', '--porcelain', '-uall'])
  const rows = []
  for (const line of lines(out)) {
    // Columns are fixed: XY then a space then the path. NEVER trim the line.
    if (line.slice(0, 2) !== '??') continue
    const p = line.slice(3)
    if (p) rows.push({ path: p, from: null, status: 'new' })
  }
  return rows
}

// The patch for one file, whole-file by default and falling back to -U3 when
// that is absurdly large. `untracked` files come in via --no-index against
// /dev/null, which is the only way git will diff a file it does not track.
function patchFor(git, ref, file, untracked) {
  const gen = (u) =>
    untracked
      ? git(['diff', '--no-index', `--unified=${u}`, '--', '/dev/null', file.path])
      : git(['diff', ref, `--unified=${u}`, '--', file.path])

  let patch = gen(WHOLE_FILE_CONTEXT) || ''
  let whole = true
  if (Buffer.byteLength(patch, 'utf8') > PATCH_LIMIT_BYTES) {
    patch = gen(3) || ''
    whole = false
  }
  return { patch, whole }
}

function numstatFor(git, ref, file, untracked) {
  const out = untracked
    ? git(['diff', '--no-index', '--numstat', '--', '/dev/null', file.path])
    : git(['diff', ref, '--numstat', '--', file.path])
  return parseNumstat(out)
}

/**
 * Where is the person reading this?
 *
 * `local` — at the machine that holds the page, so a `file://` URL opens.
 * `remote` — somewhere else, so it does not.
 * `unknown` — CANNOT TELL, and that is a real answer rather than a soft `local`.
 *
 * **This decides wording and nothing else.** Nothing in the engine serves,
 * publishes or refuses on the strength of it, because being wrong has to stay
 * cheap in both directions: a wrong `local` prints a dead link (the bug this
 * exists to fix), and a wrong `remote` acted upon would publish something the
 * tooling cannot remove, unprompted. `unknown` is therefore wired to exactly the
 * behaviour that existed before any of this.
 *
 * `env` is passed in, never read from `process` here, so a test states the world
 * it is testing instead of inheriting the machine the suite happens to run on.
 *
 * WHAT WOULD FOOL THIS: the bridge variable is an undocumented harness internal
 * and may be renamed or dropped, so its ABSENCE proves nothing — which is the
 * whole reason `unknown` exists and the default is not `local`.
 */
function detectReader(env = {}) {
  // SSH first: a standard convention, and the strongest available signal. If the
  // shell arrived over the network, the page's path is on a machine the reader
  // is not looking at.
  if (env.SSH_CONNECTION || env.SSH_TTY) return { reader: 'remote', why: 'ssh' }

  // The operator is driving this session from somewhere else — the case that
  // produced the original dead link, read on a phone.
  if (env.CLAUDE_CODE_BRIDGE_SESSION_ID) return { reader: 'remote', why: 'bridge session' }

  // CLAUDE_CODE_ENTRYPOINT IS DELIBERATELY NOT CONSULTED. It describes the
  // PROCESS, not the reader, and reports `cli` for a bridged session — it said
  // exactly that for the session this was written from, where the reader was on
  // a phone. Using it would produce a confident, wrong `local`.
  //
  // A TTY CHECK IS ALSO USELESS, and is named so nobody reaches for it: stdin is
  // never a tty under Claude Code, so it discriminates nothing at all.
  return { reader: 'unknown', why: null }
}

/**
 * The reader, config first. An explicit `local`/`remote` is BELIEVED without
 * sniffing: the operator knows where they are reading, and no signal outranks
 * being told.
 */
function resolveReader(config, env = {}) {
  const setting = (config && config.review && config.review.reader) || 'detect'
  if (setting === 'local' || setting === 'remote') return { reader: setting, why: 'configured' }
  return detectReader(env)
}

/**
 * Collect everything the page needs.
 *
 * `mode` is `'working'` (uncommitted work vs HEAD — the default, "what did this
 * phase just do") or `'branch'` (everything since the base branch — "what does
 * this whole spec do"). Both resolve to a single ref diffed against the working
 * tree, so committed and uncommitted work are collected by one code path.
 *
 * `fellBack` records that `branch` was reached because the working tree was
 * clean, not because the caller asked for it — see the fallback in
 * `specEnvReview` (`cli.js`).
 */
function collectReview({ spec, git, mode = 'working', ref, base = null, now, notes = null, fellBack = false }) {
  const files = []
  for (const f of trackedFiles(git, ref)) {
    const { patch, whole } = patchFor(git, ref, f, false)
    const { additions, deletions, binary } = numstatFor(git, ref, f, false)
    files.push({ ...f, additions, deletions, binary, whole, noise: isNoise(f.path), patch })
  }
  for (const f of untrackedFiles(git)) {
    const { patch, whole } = patchFor(git, ref, f, true)
    const { additions, deletions, binary } = numstatFor(git, ref, f, true)
    files.push({ ...f, additions, deletions, binary, whole, noise: isNoise(f.path), patch })
  }

  // Content hashes and the stored review state, folded on before the totals so
  // the page and `--json` see one shape.
  const store = notes || emptyNotes(spec.folder)
  const { totals: noteTotals, unanchored } = applyNotes(files, store, fileHashes(git, files))

  const totals = files.reduce(
    (acc, f) => ({
      files: acc.files + 1,
      additions: acc.additions + f.additions,
      deletions: acc.deletions + f.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  )

  return {
    spec: spec.folder,
    title: spec.folder,
    branch: spec.branch,
    worktree: spec.worktreePath,
    mode,
    base,
    ref,
    // True only when `branch` was reached by the clean-tree fallback rather
    // than by `--branch`. The page says so, because "everything since main" and
    // "everything since main, because there was nothing uncommitted" are
    // different answers to "what am I looking at".
    fellBack,
    generatedAt: now,
    totals,
    files,
    notes: {
      version: store.version || NOTES_VERSION,
      updatedAt: store.updatedAt || null,
      totals: noteTotals,
      unanchored,
    },
    review: null,
  }
}


/* ==========================================================================
 * Notes — the review round-trip
 *
 * The page is read somewhere else (often a phone), so what you conclude while
 * reading has to travel back as DATA: accepts, comments, and later the agent's
 * resolutions. It arrives as a clipboard blob, is merged into a sidecar beside
 * the page, and is read back at the next render.
 *
 * Everything here is engine-owned and versioned. The blob is UNTRUSTED input —
 * it has been through a clipboard and a chat window — so it is validated
 * wholesale before a byte is written.
 * ========================================================================== */

const NOTES_VERSION = 1

// A file that is gone has no content to hash, and an accept still has to mean
// something about it. A sentinel is comparable and obviously not a blob sha.
const DELETED_HASH = '(deleted)'

// `hash-object` takes every path on one command line, so chunk it rather than
// discovering ARG_MAX on the one spec that touched 400 files.
const HASH_BATCH = 100

/**
 * The git blob hash of each file's CURRENT working-tree content.
 *
 * THE IDENTITY AN ACCEPT IS KEYED TO, and deliberately not the patch. A patch
 * is a function of the ref as much as the file: commit the phase and `HEAD`
 * moves, so every patch changes while no file did — and every accept would
 * lapse at the exact moment the work was finished. `--branch` does the same in
 * reverse. Content keying survives both, because it describes the thing you
 * actually read.
 *
 * A hash that cannot be computed is `null`, never a guess: it compares unequal
 * to every recorded accept, so the cannot-tell case renders as lapsed rather
 * than as approval (see `.claude/rules/negative-checks.md`).
 */
function fileHashes(git, files) {
  const out = new Map()
  const live = []
  for (const f of files) {
    if (f.status === 'deleted') out.set(f.path, DELETED_HASH)
    else live.push(f.path)
  }
  for (let i = 0; i < live.length; i += HASH_BATCH) {
    const batch = live.slice(i, i + HASH_BATCH)
    const got = lines(git(['hash-object', '--', ...batch]))
    if (got.length === batch.length) {
      batch.forEach((p, n) => out.set(p, got[n]))
      continue
    }
    // One unhashable path fails the whole batch, so fall back per file rather
    // than losing every other file's hash with it.
    for (const p of batch) out.set(p, lines(git(['hash-object', '--', p]))[0] || null)
  }
  return out
}

// The sidecar sits beside the page and the `.url` file, under gitignored
// `.spec-env/` — a review leaves no trace in the branch it reviews.
function reviewNotesPath(outPath) {
  return outPath.replace(/\.html$/, '') + '.notes.json'
}

function emptyNotes(specFolder) {
  return { version: NOTES_VERSION, spec: specFolder, updatedAt: null, files: {}, comments: [] }
}

/**
 * Read the sidecar. Never throws, and reports `corrupt` rather than hiding it.
 *
 * A file we cannot parse is the third state: it is not "no notes". Rendering
 * carries on without them (the page is a convenience), but a MERGE must refuse,
 * because writing over an unreadable file is how someone's whole review pass
 * disappears. The caller decides which of those it is.
 */
function readNotes(outPath, specFolder) {
  let raw
  try {
    raw = fs.readFileSync(reviewNotesPath(outPath), 'utf8')
  } catch {
    // Absent is the ordinary state — most reviews never write one.
    return { notes: emptyNotes(specFolder), corrupt: false, present: false }
  }
  try {
    const parsed = JSON.parse(raw)
    return {
      notes: {
        version: parsed.version,
        spec: parsed.spec || specFolder,
        updatedAt: parsed.updatedAt || null,
        files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      },
      corrupt: false,
      present: true,
    }
  } catch {
    return { notes: emptyNotes(specFolder), corrupt: true, present: true }
  }
}

function writeNotes(outPath, notes) {
  const p = reviewNotesPath(outPath)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(notes, null, 2) + '\n')
  return p
}

/**
 * Validate a blob from the page, wholesale.
 *
 * It refuses on the FIRST problem and writes nothing, because a half-merged
 * sidecar is worse than a rejected paste: you would have to work out which
 * half landed. Every message names the offending entry so the answer is in the
 * refusal rather than in a second investigation.
 *
 * Unknown keys are IGNORED rather than rejected — an older engine meeting a
 * newer page should drop what it does not understand, not refuse the accepts it
 * does.
 */
function validateNotesBlob(blob, specFolder) {
  const fail = (m) => {
    throw new Error(`notes blob: ${m}`)
  }
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) fail('not a JSON object')
  if (blob.version !== NOTES_VERSION) {
    fail(`version ${JSON.stringify(blob.version)} — this engine reads version ${NOTES_VERSION}`)
  }
  // Pasting the wrong spec's review is the one mistake that would look entirely
  // successful, so the blob names its spec and the engine checks it.
  if (blob.spec && specFolder && blob.spec !== specFolder) {
    fail(`written for ${blob.spec}, but this is ${specFolder}`)
  }
  const arr = (key) => {
    const v = blob[key]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v)) fail(`${key} must be an array`)
    return v
  }
  const accepted = arr('accepted')
  for (const a of accepted) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) fail('every accepted entry must be an object')
    if (typeof a.path !== 'string' || !a.path) fail('an accepted entry has no path')
    if (typeof a.hash !== 'string' || !a.hash) fail(`accepted entry ${a.path} has no hash`)
  }
  const unaccepted = arr('unaccepted')
  for (const p of unaccepted) {
    if (typeof p !== 'string' || !p) fail('every unaccepted entry must be a path')
  }
  const comments = arr('comments')
  for (const c of comments) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail('every comment must be an object')
    if (typeof c.id !== 'string' || !c.id) fail('a comment has no id')
    if (typeof c.file !== 'string' || !c.file) fail(`comment ${c.id} has no file`)
    if (typeof c.note !== 'string' || !c.note.trim()) fail(`comment ${c.id} has no note`)
    if (c.line !== undefined && c.line !== null && !Number.isInteger(c.line)) {
      fail(`comment ${c.id} has a non-integer line`)
    }
  }
  return { accepted, unaccepted, comments }
}

/**
 * Merge a validated blob into the stored notes. Pure.
 *
 * MERGE, NEVER REPLACE. The page only knows the render it was built from, so a
 * replace would drop the agent's resolutions and let a tab left open overnight
 * roll back everything recorded since. Anything the blob does not mention is
 * carried through untouched — which is also why un-accepting is an EXPLICIT
 * `unaccepted` list rather than absence from `accepted`.
 *
 * Comments merge by id, and the page mints ids from the render timestamp, so
 * pasting the same blob twice is idempotent instead of doubling every note.
 */
function mergeNotes(existing, blob, now) {
  const notes = {
    version: NOTES_VERSION,
    spec: existing.spec,
    updatedAt: now,
    files: { ...existing.files },
    comments: existing.comments.slice(),
  }
  for (const a of blob.accepted) notes.files[a.path] = { acceptedHash: a.hash, acceptedAt: now }
  for (const p of blob.unaccepted) delete notes.files[p]

  const indexById = new Map(notes.comments.map((c, i) => [c.id, i]))
  for (const c of blob.comments) {
    const entry = {
      id: c.id,
      file: c.file,
      line: c.line === undefined ? null : c.line,
      lineText: c.lineText === undefined ? null : c.lineText,
      check: c.check === undefined ? null : c.check,
      note: c.note,
      raisedAt: now,
      resolved: null,
    }
    const at = indexById.get(c.id)
    if (at === undefined) {
      indexById.set(c.id, notes.comments.length)
      notes.comments.push(entry)
      continue
    }
    // A re-paste refreshes the text but keeps the history: when it was first
    // raised, and any resolution already written against it.
    const prev = notes.comments[at]
    notes.comments[at] = { ...entry, raisedAt: prev.raisedAt, resolved: prev.resolved }
  }
  return notes
}

/**
 * Validate a resolutions file — the agent's half of the round-trip.
 *
 * Separate from `validateNotesBlob` because the shapes and the authors differ:
 * a blob comes from a page through a clipboard, and this comes from whatever
 * just finished working the comments. Same rule though — refuse wholesale, and
 * name what is wrong.
 */
function validateResolutions(raw) {
  const fail = (m) => {
    throw new Error(`resolutions: ${m}`)
  }
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.resolved) ? raw.resolved : null
  if (!list) fail('expected an array of { id, note }')
  for (const r of list) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail('every entry must be an object')
    if (typeof r.id !== 'string' || !r.id) fail('an entry has no id')
    // "Resolved" with nothing said is not a resolution — the note is the half
    // that lets the next read verify the fix instead of trusting it.
    if (typeof r.note !== 'string' || !r.note.trim()) fail(`entry ${r.id} has no note`)
  }
  return list
}

/**
 * Attach resolutions to the comments they name. Pure.
 *
 * An id matching nothing is REPORTED AND SKIPPED, never invented and never
 * fatal. A resolution naming a comment that does not exist is a mistake worth
 * surfacing — but failing the whole call would throw away the work that was
 * genuinely done on the ids that did match.
 *
 * Re-resolving overwrites rather than stacking: the newest account of what was
 * done is the one that matches the code.
 */
function applyResolutions(notes, resolutions, now) {
  const byId = new Map(notes.comments.map((c) => [c.id, c]))
  const unknown = []
  let applied = 0
  for (const r of resolutions) {
    const c = byId.get(r.id)
    if (!c) {
      unknown.push(r.id)
      continue
    }
    c.resolved = { at: now, note: r.note }
    applied++
  }
  return { notes: { ...notes, updatedAt: now }, applied, unknown }
}

/**
 * Fold the stored notes onto the collected files.
 *
 * `accepted` is `true` only when the recorded hash matches what is there now;
 * a difference is `'lapsed'` and is SAID rather than silently forgotten, so a
 * file you vouched for two phases ago cannot quietly pass as still-read.
 */
function applyNotes(files, notes, hashes) {
  const byFile = new Map()
  for (const c of notes.comments) {
    if (!byFile.has(c.file)) byFile.set(c.file, [])
    byFile.get(c.file).push(c)
  }
  const totals = { accepted: 0, lapsed: 0, unresolved: 0, resolved: 0 }
  for (const f of files) {
    const hash = hashes.has(f.path) ? hashes.get(f.path) : null
    f.hash = hash === undefined ? null : hash
    const rec = notes.files[f.path]
    if (!rec || !rec.acceptedHash) {
      f.accepted = false
      f.acceptedAt = null
    } else if (f.hash && rec.acceptedHash === f.hash) {
      f.accepted = true
      f.acceptedAt = rec.acceptedAt || null
      totals.accepted++
    } else {
      f.accepted = 'lapsed'
      f.acceptedAt = rec.acceptedAt || null
      totals.lapsed++
    }
    f.comments = byFile.get(f.path) || []
  }
  for (const c of notes.comments) {
    if (c.resolved) totals.resolved++
    else totals.unresolved++
  }
  // A comment on a file that is no longer in the diff (reverted, or landed in
  // an earlier phase) would otherwise vanish from the page along with its file.
  const shown = new Set(files.map((f) => f.path))
  const unanchored = notes.comments.filter((c) => !shown.has(c.file))
  return { totals, unanchored }
}


/**
 * The page template — a SHIPPED ASSET, not generated markup.
 *
 * `assets/` is in every distribution's `files`, and the build copies non-`.md`
 * assets across verbatim, so this resolves identically from the source package
 * (`packages/common/src/env` → `packages/common/assets`) and from a built
 * distribution (`src/env` → `<pkg>/assets`).
 *
 * The engine SPLICES into it and never authors markup: the model's prose arrives
 * as JSON and the diff arrives as text, so neither has to survive a round-trip
 * through generated HTML.
 */
const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'assets', 'review', 'page.html')
const DATA_PLACEHOLDER = '__REVIEW_DATA__'
const REVIEW_PLACEHOLDER = '__REVIEW_BLOCK__'
const TITLE_PLACEHOLDER = '__REVIEW_TITLE__'
const PLACEHOLDER_RE = /__REVIEW_(?:TITLE|BLOCK|DATA)__/g

function loadTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8')
}

// Escape the one sequence that could end the data island early. A patch
// containing `</script>` is not hypothetical — this feature reviews its own
// source, and the template above contains one.
function escapeIsland(json) {
  return json.replace(/<\//g, '<\\/')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

/**
 * Splice the collected data (and, later, the written review) into the template.
 * The data goes in as JSON, never as generated markup — that is the property the
 * whole design rests on.
 */
/**
 * The fragment form of the template: what an artifact host can accept.
 *
 * A published page is wrapped in the host's own `<!doctype>`/`<head>`/`<body>`
 * skeleton, so handing it a complete document nests two of them. The fragment
 * carries the `<title>` (hosts read it for the tab name), every `<style>` and
 * `<script>` block out of `<head>`, then the body contents — and no wrapper.
 *
 * IT SPLITS THE TEMPLATE, NEVER THE RENDERED PAGE, and that is the whole
 * correctness argument. The template contains exactly one of each boundary tag
 * and nothing but placeholders where content goes. A rendered page contains the
 * diff, and this feature reviews its own source — so `<!doctype html>`,
 * `<html>` and `<body>` appear inside it as ordinary patch text. A regex over
 * the rendered page finds those and cuts in the wrong place; the first hand
 * publish of `feat-review-offer-lands` hit exactly that, with four
 * wrapper-looking tags in the output that were all patch content.
 */
function fragmentTemplate(template = null) {
  const t = template || loadTemplate()

  const headStart = t.indexOf('<head>')
  const headEnd = t.indexOf('</head>')
  const bodyOpen = t.indexOf('<body')
  const bodyStart = t.indexOf('>', bodyOpen) + 1
  const bodyEnd = t.lastIndexOf('</body>')
  if (headStart < 0 || headEnd < 0 || bodyOpen < 0 || bodyEnd < 0) {
    throw new Error('review template has no <head>/<body> to split — cannot build a fragment')
  }

  const head = t.slice(headStart, headEnd)
  const title = /<title>[\s\S]*?<\/title>/.exec(head)
  const carried = head.match(/<(style|script)\b[\s\S]*?<\/\1>/g) || []

  return [title ? title[0] : '', ...carried, t.slice(bodyStart, bodyEnd).trim()]
    .filter(Boolean)
    .join('\n')
}

/**
 * The same data, spliced into the fragment instead of the whole document. One
 * pass over the placeholders, for the same reason `renderReviewPage` uses one.
 */
function renderReviewFragment(data, { template = null, reviewHtml = '' } = {}) {
  const values = {
    [TITLE_PLACEHOLDER]: escapeHtml(data.title),
    [REVIEW_PLACEHOLDER]: reviewHtml,
    [DATA_PLACEHOLDER]: escapeIsland(JSON.stringify(data)),
  }
  return fragmentTemplate(template).replace(PLACEHOLDER_RE, (m) => values[m])
}

function renderReviewPage(data, { template = null, reviewHtml = '' } = {}) {
  const values = {
    [TITLE_PLACEHOLDER]: escapeHtml(data.title),
    [REVIEW_PLACEHOLDER]: reviewHtml,
    [DATA_PLACEHOLDER]: escapeIsland(JSON.stringify(data)),
  }
  // ONE pass, so nothing spliced in is ever rescanned. This is not theoretical:
  // the page reviews its own source, so the data island legitimately CONTAINS
  // all three placeholder strings, and sequential replaces would splice a whole
  // JSON blob into the middle of a patch — or into a review note that happened
  // to quote a placeholder name.
  return (template || loadTemplate()).replace(PLACEHOLDER_RE, (m) => values[m])
}

/**
 * Render the written review into HTML.
 *
 * THE ENGINE RENDERS; THE MODEL JUDGES. The review arrives as JSON — a short
 * read plus severity-tagged checks — and this turns it into markup. The two
 * rejected alternatives: the model emitting HTML (more tokens, and one unclosed
 * tag breaks the page), and the engine parsing markdown (a markdown renderer to
 * ship and maintain for one surface).
 *
 * Every field is escaped. The review is model-authored text arriving through a
 * file, which is exactly the input that should never be trusted as markup.
 */
const CHECK_LEVELS = ['flag', 'confirm', 'good']

function renderReviewBlock(review) {
  if (!review || typeof review !== 'object') return ''
  const parts = ['<section class="review">']
  if (review.summary) {
    parts.push(`<p class="review-summary">${escapeHtml(review.summary)}</p>`)
  }
  const checks = Array.isArray(review.checks) ? review.checks : []
  if (checks.length) {
    parts.push('<ul class="checks">')
    checks.forEach((c, i) => {
      // An unknown level is shown as `confirm` rather than dropped: losing a
      // reviewer's note because it was tagged oddly is worse than showing it
      // under a neutral heading.
      const level = CHECK_LEVELS.includes(c.level) ? c.level : 'confirm'
      const file = c.file ? `<span class="check-file">${escapeHtml(c.file)}</span>` : ''
      // The id is positional and therefore stable for THIS render, which is all
      // a reply needs: it travels back in the same blob the page was built from.
      // `data-file` is what lets an answer land on the file the check is about.
      const id = `k${i}`
      const fileAttr = c.file ? ` data-file="${escapeHtml(c.file)}"` : ''
      parts.push(
        `<li class="check ${level}" data-check="${id}"${fileAttr}>` +
          `<span class="check-level">${level}</span>` +
          `${file}<span class="check-note">${escapeHtml(c.note || '')}</span></li>`,
      )
    })
    parts.push('</ul>')
  }
  parts.push('</section>')
  return parts.join('\n')
}

/**
 * Where a spec's published URL is remembered, and what it currently says.
 *
 * The engine READS this file and never writes it, and it does not know what the
 * string means — it cannot publish, and nothing here can. It is named here so
 * the skill that does publish never has to construct a path, which is the only
 * way the two halves stay in step.
 */
function reviewUrlPath(outPath) {
  return outPath.replace(/\.html$/, '') + '.url'
}

// The publish-ready copy, beside the page it came from. Same stem, so the three
// sidecars (`.notes.json`, `.url`, `.publish.html`) all read as one spec's set.
function reviewPublishPath(outPath) {
  return outPath.replace(/\.html$/, '') + '.publish.html'
}

function readReviewUrl(outPath) {
  try {
    return fs.readFileSync(reviewUrlPath(outPath), 'utf8').trim() || null
  } catch {
    return null
  }
}

// Default output path for a spec's page, under the gitignored `.spec-env/`.
function reviewOutPath(dir, specFolder, out) {
  if (out) return path.resolve(dir, out)
  return path.join(dir, REVIEW_DIR, `${specFolder}.html`)
}

/**
 * The page's path as a `file://` URL.
 *
 * A bare absolute path is not clickable in ANY terminal; `file://` is linkified
 * by iTerm2, VS Code's terminal and Terminal.app, so the page is one click from
 * the line that announces it. Printed ALONGSIDE the path, never instead of it —
 * the path is what you pass to another command, and the URL is what you click.
 *
 * Deliberately not an `open` call: that assumes a GUI, a default browser and
 * that you are sitting at the machine. The whole point of this page is that it
 * does not care where you are.
 */
function reviewFileUrl(outPath) {
  // Encode each segment, then restore the separators — a path can legitimately
  // contain spaces, `#` or `?`, and all three break a URL left raw.
  const encoded = path
    .resolve(outPath)
    .split(path.sep)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `file://${encoded.startsWith('/') ? '' : '/'}${encoded}`
}

// Write the page, creating its directory. Returns the absolute path written.
function writeReviewPage(outPath, html) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, html)
  return outPath
}

module.exports = {
  WHOLE_FILE_CONTEXT,
  NOTES_VERSION,
  DELETED_HASH,
  fileHashes,
  reviewNotesPath,
  emptyNotes,
  readNotes,
  writeNotes,
  validateNotesBlob,
  validateResolutions,
  mergeNotes,
  applyResolutions,
  applyNotes,
  PATCH_LIMIT_BYTES,
  REVIEW_DIR,
  rawGitReader,
  isNoise,
  lines,
  parseNumstat,
  trackedFiles,
  untrackedFiles,
  collectReview,
  renderReviewPage,
  reviewOutPath,
  reviewFileUrl,
  writeReviewPage,
  escapeIsland,
  escapeHtml,
  renderReviewBlock,
  reviewUrlPath,
  reviewPublishPath,
  readReviewUrl,
  fragmentTemplate,
  renderReviewFragment,
  detectReader,
  resolveReader,
  CHECK_LEVELS,
  loadTemplate,
  TEMPLATE_PATH,
  DATA_PLACEHOLDER,
  REVIEW_PLACEHOLDER,
  TITLE_PLACEHOLDER,
}
