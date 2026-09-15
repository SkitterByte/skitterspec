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
const crypto = require('node:crypto')
const { readPhases, readOverview } = require('./resolve.js')
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

  // The last honoured verdict, for the page to show as history. Only the last:
  // the log is an audit trail and the page has one question to answer with it —
  // why does this look untouched? — which the most recent entry answers.
  const decisions = Array.isArray(store.decisions) ? store.decisions : []
  const lastDecision = decisions.length ? decisions[decisions.length - 1] : null

  // Every bucket, because a page is rendered for specs in `in-progress/` and for
  // finished ones in `complete/` — and the finished one is the case this exists
  // for. `null` when it cannot tell, and the page leaves its button alone.
  const specDir = spec.worktreePath ? findSpecDirIn(spec.worktreePath, spec.folder) : null
  const phases = specDir ? readPhases(specDir) : null
  // The PR description this page never had: why the change exists, what it
  // touches, and what this phase set out to do.
  const context = readContextIn(specDir, phases)

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
    // Is there a phase left for `/spec-next` to build? The page needs it to
    // know whether offering `Commit & Continue` means anything — and it is read
    // from the SPEC'S OWN WORKTREE, where its phase statuses are current. On the
    // base branch an in-flight spec still reads as it did before it started.
    //
    // Absent stays absent: a spec whose phases cannot be read adds no key, so
    // the page renders byte-identically to how it did before any of this.
    ...(phases ? { phases } : {}),
    // Absent stays absent, exactly as `phases` does: a spec this cannot read
    // adds no key and the page renders its header-less self.
    ...(context ? { context } : {}),
    // WHICH ENGINE DREW THIS PAGE. The render is always current — the git reads
    // happen per request — so a page rendered by a stale process looks entirely
    // right: the counts move, `generatedAt` moves, the diff is correct. Only the
    // renderer is old, and nothing on the page said so. This is the line that
    // makes the question answerable by reading the artefact.
    engine: ENGINE_VERSION,
    totals,
    files,
    notes: {
      version: store.version || NOTES_VERSION,
      updatedAt: store.updatedAt || null,
      totals: noteTotals,
      unanchored,
      // Absent stays absent, for the same reason `readNotes` leaves it off: a
      // review that has never reached a verdict must render byte-identically to
      // how it did before any of this existed.
      ...(lastDecision ? { lastDecision } : {}),
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

// Read once, from this package — it is this file that draws the page, so its
// own version is the honest answer to "what rendered this".
/**
 * Find a spec's folder under any bucket of one checkout, and read its phases.
 *
 * Kept here rather than reaching for `findSpecFolder`, which searches several
 * roots and carries preference rules this does not want: there is exactly one
 * tree to look in — the spec's own worktree — and looking anywhere else would
 * answer about a branch that is not the one being reviewed.
 */
function findSpecDirIn(worktreePath, folder) {
  for (const bucket of ['in-progress', 'backlog', 'complete', 'cancelled']) {
    const dir = path.join(worktreePath, 'specs', bucket, folder)
    if (fs.existsSync(dir)) return dir
  }
  return null
}

/**
 * What the change is FOR, for the top of the page — composed from the spec's
 * own files, never written.
 *
 * That is the same rule the diff follows: nothing here passes through the
 * model, so the header is free however large the review. The moment it were
 * generated it would start costing tokens and start going stale.
 *
 * `null` when there is nothing to say — and a spec with an unreadable overview
 * is not a broken spec. The page rendered without this yesterday.
 */
function readContextIn(dir, phases) {
  const overview = dir ? readOverview(dir) : null
  const phase = phases && phases.live ? phases.live : null
  if (!overview && !phase) return null
  return { ...(overview || {}), ...(phase ? { phase } : {}) }
}

const ENGINE_VERSION = (() => {
  try {
    return require('../../package.json').version || null
  } catch {
    return null
  }
})()

const NOTES_VERSION = 1

/**
 * The four verdicts a review pass can carry, and what an absent one means.
 *
 * A VERDICT IS CHOSEN BY A PERSON, ONCE, PER REVIEW — it is not derived from
 * how many boxes are ticked. That distinction is the whole point: counting
 * marks stays forbidden (see `applyNotes`, which still gates nothing), and this
 * is the deliberate, single place a review gets to say what it concluded.
 *
 * THE VERDICT NAMES THE ACTION. It was `approve` once, and an approval that
 * only recorded itself is the one thing on a review page that does not describe
 * what happens — a review is the guard in front of an action, so the word is
 * the action: `commit`, `commit-continue`, `changes`, `discuss`.
 *
 * `discuss` is the default because it is the behaviour that existed before any
 * verdict did. So a blob from an older page, or one a reader sent without
 * choosing, keeps doing exactly what it always did.
 */
const VERDICTS = ['commit', 'commit-continue', 'changes', 'discuss']
const DEFAULT_VERDICT = 'discuss'

// The verdicts that COMMIT, and are therefore blocked by an open comment. One
// list, so a fourth verdict cannot become a way around the single refusal this
// engine makes — adding a committing verdict means adding it here, and the
// block follows for free.
const COMMITTING = ['commit', 'commit-continue']

/**
 * What an older sidecar's `approve` means now. Pure.
 *
 * TOLERANCE, NOT MIGRATION. These files are gitignored, so there is no fleet to
 * migrate and no script anyone would remember to run — the rename is absorbed
 * at the point of reading, where it cannot be skipped. Anything else is passed
 * through untouched, including a value this engine does not know: `readVerdict`
 * answers what a stored word means, and refusing an unknown one is
 * `validateNotesBlob`'s job, not this function's.
 */
function readVerdict(stored) {
  return stored === 'approve' ? 'commit' : stored
}

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
        // Absent stays absent. A sidecar written before verdicts existed, or by
        // a review that never reached one, must not gain an empty `decisions`
        // key just by being read — the round-trip has to be byte-stable for
        // everyone who is not using this.
        //
        // A logged `approve` is read as `commit` HERE, at the read, rather than
        // by a migration nobody would run: these files are gitignored, so the
        // rename has to be absorbed where it cannot be skipped.
        ...(Array.isArray(parsed.decisions)
          ? { decisions: parsed.decisions.map((d) => ({ ...d, verdict: readVerdict(d.verdict) })) }
          : {}),
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

/* ==========================================================================
 * Pending passes — a review that arrived over the wire
 *
 * A page that is SERVED can hand its pass straight back rather than going
 * through a clipboard and a chat window. That is a write path reachable by
 * anyone who can reach the page, so what it writes is deliberately not the
 * sidecar: a POST lands here, in a HOLDING AREA, and nothing reaches the
 * review until a person reads its code out. The code is what makes a stranger's
 * pass inert and says WHICH pass when several are in flight.
 *
 * On disk rather than in the server's memory, and that is a constraint from
 * `feat-review-serve-version` rather than a preference: that feature restarts a
 * stale server automatically, and a restart that dropped the pass you just sent
 * would be a new way to lose work. It also means `--claim` needs no running
 * server at all.
 * ========================================================================== */

const PENDING_VERSION = 1

// Beside the page and the notes sidecar, under gitignored `.spec-env/`.
function reviewPendingPath(outPath) {
  return outPath.replace(/\.html$/, '') + '.pending.json'
}

function emptyPending(specFolder) {
  return { version: PENDING_VERSION, spec: specFolder, passes: [] }
}

/**
 * Read the holding area. Never throws; reports `corrupt` rather than hiding it.
 *
 * Same three states as `readNotes`, for the same reason: a file we cannot parse
 * is not "no pending passes", and claiming against it must refuse rather than
 * silently find nothing.
 */
function readPending(outPath, specFolder) {
  let raw
  try {
    raw = fs.readFileSync(reviewPendingPath(outPath), 'utf8')
  } catch {
    return { pending: emptyPending(specFolder), corrupt: false, present: false }
  }
  try {
    const parsed = JSON.parse(raw)
    return {
      pending: {
        version: parsed.version || PENDING_VERSION,
        spec: parsed.spec || specFolder,
        passes: Array.isArray(parsed.passes) ? parsed.passes : [],
      },
      corrupt: false,
      present: true,
    }
  } catch {
    return { pending: emptyPending(specFolder), corrupt: true, present: true }
  }
}

function writePending(outPath, pending) {
  const p = reviewPendingPath(outPath)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(pending, null, 2) + '\n')
  return p
}

const PENDING_CODE_LENGTH = 6

/**
 * A code for one pending pass. Unique among those currently pending.
 *
 * NOT A SECRET, and it does not need to be: it is printed on the page by
 * design, and what it authorises is a person reading it out. What it must not
 * do is COLLIDE — two pending passes sharing a code is how the wrong one gets
 * applied — so it is drawn against the set rather than drawn and hoped for.
 *
 * WHAT WOULD FOOL THIS: nothing about uniqueness, but note it is drawn from the
 * passes it is GIVEN. A caller that mints against a stale read could still
 * collide, which is why the mint and the write happen together in `addPending`.
 */
function mintPendingCode(pending, random = () => crypto.randomInt(0, 10 ** PENDING_CODE_LENGTH)) {
  const taken = new Set((pending.passes || []).map((p) => p.code))
  // Bounded rather than `while (true)`: with a million codes and a handful
  // pending this cannot realistically spin, and a bound means a bug here fails
  // loudly instead of hanging the server.
  for (let i = 0; i < 1000; i++) {
    const code = String(random()).padStart(PENDING_CODE_LENGTH, '0')
    if (!taken.has(code)) return code
  }
  throw new Error('could not mint a unique pending code')
}

/**
 * Add a pass to the holding area, returning the new store and its code. Pure.
 *
 * SUPERSEDES WITHIN A RENDER. A second pass sent from the same page render
 * replaces the first unclaimed one from that render, so the code on the screen
 * is always the pass on the screen — press Approve, change your mind, press
 * Request changes, and there is one pass waiting, not two. Passes from a
 * DIFFERENT render stand alongside it: those are two people, or two sittings,
 * and neither supersedes the other.
 */
function addPending(pending, { blob, at, render }, mint = mintPendingCode) {
  const kept = (pending.passes || []).filter((p) => p.render !== render)
  const next = { ...pending, passes: kept }
  const code = mint(next)
  next.passes = [...kept, { code, at, render, blob }]
  return { pending: next, code }
}

/**
 * What is waiting, as the render should describe it. Pure.
 *
 * THE BLOB IS DELIBERATELY NOT HERE. A decision about a waiting pass needs its
 * code, its verdict and its age; the notes are what a CLAIM is for. Returning
 * them would put an unclaimed stranger's text into the context of whoever is
 * reading the render — which is the one thing the holding area exists to defer.
 *
 * Oldest first, and stable: two renders in a row must name the passes in the
 * same order, or a reader cannot trust the list they just read against the one
 * they are about to be offered. Ties break on the code, which is unique among
 * pending, so the order is total rather than merely usually-stable.
 */
function describePending(pending) {
  return (pending.passes || [])
    .map((p) => ({
      code: p.code,
      // Read through the rename too: a pass POSTed by an older page says
      // `approve`, and the operator must be offered the word that describes
      // what claiming it would do.
      verdict: readVerdict((p.blob && p.blob.verdict) || null) || null,
      at: p.at || null,
    }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.code.localeCompare(b.code))
}

/**
 * How long ago, in words a person reads at a glance. Pure.
 *
 * AGE IS THE TELL. A pass sent three days ago is not a review anyone in this
 * conversation just pressed, and that is exactly how a stranger's pass gives
 * itself away — so it is reported beside the code rather than left in a
 * timestamp nobody parses.
 *
 * Unknown stays unknown: a pass with no `at` says so rather than being rendered
 * as "just now", which is the reading that would make it look like yours.
 */
function pendingAge(at, now) {
  const then = Date.parse(at)
  const ms = Date.parse(now) - then
  if (!Number.isFinite(then) || !Number.isFinite(ms) || ms < 0) return 'unknown age'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Take a pass out of the holding area by its code. Pure.
 *
 * THE ONE REFUSAL HERE, and it never falls back. A code that matches nothing
 * returns no pass — not "the only one", not "the most recent". Both of those
 * are the same mistake: they would let a pass nobody read out reach the review,
 * which is the entire thing the code exists to prevent
 * (`.claude/rules/negative-checks.md` rule 4 — the unknown case does nothing).
 *
 * Claiming CONSUMES: the entry is gone from the returned store, so the same
 * code cannot be claimed twice and an old code cannot resurrect an old pass.
 */
function claimPending(pending, code) {
  const passes = pending.passes || []
  const at = passes.findIndex((p) => p.code === code)
  if (at === -1) return { pass: null, pending, count: passes.length }
  const pass = passes[at]
  const rest = passes.slice(0, at).concat(passes.slice(at + 1))
  return { pass, pending: { ...pending, passes: rest }, count: rest.length }
}

/* ==========================================================================
 * The gate — a standing obligation to review, not a message in flight
 *
 * A pending pass is something someone SENT. The gate is something the repo
 * OWES: a phase ended, its page was rendered, and nobody has said what they
 * concluded yet. Kept in its own sidecar for exactly that reason — claiming a
 * pass consumes the pass, while only a COMMITTING verdict or a recorded skip
 * consumes the gate, and one file holding both states would have to encode
 * that difference anyway.
 *
 * It is the one thing in this engine that refuses. The marks still gate
 * nothing and nothing counts them — what this asserts is narrower: a phase
 * that ended is not finished until a person said something about it.
 * ========================================================================== */

const GATE_VERSION = 1

// How a disarm happened. `verdict` is a review that reached a committing
// conclusion; `skip` is the operator saying, on the record, that they are
// moving on without one.
const DISARMED_BY = ['verdict', 'skip']

function reviewGatePath(outPath) {
  return outPath.replace(/\.html$/, '') + '.gate.json'
}

function emptyGate(specFolder) {
  return { version: GATE_VERSION, spec: specFolder, armed: false, armedAt: null, phase: null, log: [] }
}

/**
 * Read the gate sidecar. Never throws, and reports `corrupt` rather than
 * hiding it — the same three states `readNotes` answers in, for the same
 * reason. Here the third state is load-bearing in the other direction: a gate
 * we cannot parse must never READ AS ARMED, because that would refuse a commit
 * on the strength of a file nobody can interpret.
 */
function readGate(outPath, specFolder) {
  let raw
  try {
    raw = fs.readFileSync(reviewGatePath(outPath), 'utf8')
  } catch {
    // Absent is the ordinary state — a project that never ends a phase through
    // the review path has no gate file at all.
    return { gate: emptyGate(specFolder), corrupt: false, present: false }
  }
  try {
    const parsed = JSON.parse(raw)
    return {
      gate: {
        version: parsed.version,
        spec: parsed.spec || specFolder,
        armed: parsed.armed === true,
        armedAt: parsed.armedAt || null,
        phase: parsed.phase === undefined ? null : parsed.phase,
        log: Array.isArray(parsed.log) ? parsed.log : [],
      },
      corrupt: false,
      present: true,
    }
  } catch {
    return { gate: emptyGate(specFolder), corrupt: true, present: true }
  }
}

function writeGate(outPath, gate) {
  const p = reviewGatePath(outPath)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(gate, null, 2) + '\n')
  return p
}

/**
 * Arm the gate. Pure.
 *
 * IDEMPOTENT ON PURPOSE. Re-rendering a page for a phase already awaiting a
 * verdict must not move `armedAt` — the timestamp answers "how long has this
 * been waiting", and a render is not an event that resets that. A gate armed
 * for a DIFFERENT phase is re-armed, because that is a new obligation.
 */
function armGate(gate, { at, phase = null }) {
  if (gate.armed && gate.phase === phase) return gate
  return { ...gate, armed: true, armedAt: at, phase }
}

/**
 * Disarm it, and say how. Pure.
 *
 * The log is append-only and nothing reads it back to decide anything — it is
 * the record that a decision was taken, which is the whole value of a skip
 * over a silence. Disarming an already-clear gate logs nothing: there was no
 * obligation, so there is no outcome to record.
 */
function disarmGate(gate, { at, by, reason = null }) {
  if (!gate.armed) return { gate, logged: false }
  const log = Array.isArray(gate.log) ? gate.log.slice() : []
  log.push({ by, at, phase: gate.phase === undefined ? null : gate.phase, reason })
  return { gate: { ...gate, armed: false, armedAt: null, phase: null, log }, logged: true }
}

/**
 * What the gate says, in three states. Pure.
 *
 * `armed` is the only one that refuses, and it is reached only by a POSITIVE
 * signal: a sidecar that is present, parseable, and says so
 * (`.claude/rules/negative-checks.md` rule 1). Everything else routes to the
 * harmless branch (rule 4) under its own name:
 *
 * - `clear` — read it, nothing is owed.
 * - `unknown` — could not read it, or the project turned the gate off. Nothing
 *   is claimed and nothing refuses.
 *
 * WHAT WOULD FOOL THIS: a gate armed for a phase whose work has since been
 * committed by hand still reads armed, so the refusal outlives the thing it
 * was guarding. That is deliberate — the exit is one `skip` with a reason,
 * which is precisely the decision this exists to put on the record — and it
 * fails toward asking rather than toward letting a phase through unread.
 */
function gateState({ gate, corrupt, present, required }) {
  if (required === false) return { state: 'unknown', reason: 'review.required is false', gate }
  if (corrupt) return { state: 'unknown', reason: 'the gate sidecar is not readable JSON', gate }
  if (!present) return { state: 'clear', reason: 'no gate recorded', gate }
  if (gate.version !== GATE_VERSION) {
    return {
      state: 'unknown',
      reason: `gate version ${JSON.stringify(gate.version)} — this engine reads version ${GATE_VERSION}`,
      gate,
    }
  }
  if (!gate.armed) return { state: 'clear', reason: 'nothing is awaiting a verdict', gate }
  return { state: 'armed', reason: 'a phase is awaiting a verdict', gate }
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
  // A KNOWN KEY WITH AN UNKNOWN VALUE IS REFUSED BY NAME, which is not the
  // unknown-key rule above wearing a hat. Dropping `verdict: "aprove"` the way
  // we drop a key we have never heard of would read as `discuss` — a review
  // that silently did nothing, reported as if it had. Absent is a different
  // thing from wrong, and only absent is allowed through.
  let verdict = null
  if (blob.verdict !== undefined && blob.verdict !== null) {
    // Read through the rename BEFORE checking: a page that has not been
    // reloaded still sends `approve`, and refusing it would turn a stale tab
    // into a rejected review rather than a committed one.
    const named = typeof blob.verdict === 'string' ? readVerdict(blob.verdict) : blob.verdict
    if (typeof named !== 'string' || !VERDICTS.includes(named)) {
      fail(`verdict ${JSON.stringify(blob.verdict)} is not one of ${VERDICTS.join(', ')}`)
    }
    verdict = named
  }
  return { accepted, unaccepted, comments, verdict }
}

/**
 * Decide what a verdict actually does, given the notes it arrives with. Pure.
 *
 * THE ONE ACCUSING CHECK HERE: an approval is refused while any comment is
 * unresolved. It reads a PRESENCE — an open comment, sitting in the sidecar —
 * rather than an absence, so there is no lookup that could have been too narrow
 * to see the thing (`.claude/rules/negative-checks.md` rule 1). The comments
 * counted are whatever is in `notes` at the moment of the call, which is after
 * the blob has been merged and after any `--resolve` has landed, so a note
 * raised and answered in the same run does not block.
 *
 * WHAT WOULD FOOL THIS: nothing about the count, but the intent behind it is
 * narrow. UNACCEPTED FILES ARE NOT COUNTED AND MUST NEVER BE. A comment is a
 * request you made; an unticked file is merely something you said nothing
 * about, and requiring every file ticked would be the counting gate this whole
 * feature was designed not to become.
 *
 * A refused approval routes to `discuss` — report and stop — rather than
 * staying `approve` with a flag beside it. Three states, and the one we cannot
 * honour goes to the harmless branch (rule 4): a caller that reads `effective`
 * and ignores `honoured` then talks instead of committing, which is the
 * failure we can afford.
 */
function judgeVerdict(verdict, notes) {
  const sent = readVerdict(verdict) || null
  const asked = sent || DEFAULT_VERDICT
  const open = (notes.comments || []).filter((c) => !c.resolved)
  const openFiles = [...new Set(open.map((c) => c.file))]
  if (!COMMITTING.includes(asked) || open.length === 0) {
    return { sent, effective: asked, honoured: true, reason: null, openCount: open.length, openFiles }
  }
  return {
    sent,
    effective: DEFAULT_VERDICT,
    honoured: false,
    reason:
      `${open.length} comment${open.length === 1 ? ' is' : 's are'} unresolved ` +
      `(${openFiles.join(', ')})`,
    openCount: open.length,
    openFiles,
  }
}

/**
 * Append one line to the outcome log. Pure.
 *
 * HISTORY, NOT STATE. Nothing reads `decisions` to decide anything — a verdict
 * is consumed by the thing it asked for (a commit, or the work) and is never
 * stored as a pending instruction, so an approval cannot go stale and later
 * commit something nobody read. What is kept is the account of what was
 * decided, when, and eventually what it produced.
 */
function appendDecision(notes, { verdict, at, note = null }) {
  const decisions = Array.isArray(notes.decisions) ? notes.decisions.slice() : []
  decisions.push({ verdict, at, note: note === undefined ? null : note })
  return { ...notes, updatedAt: at, decisions }
}

/**
 * Write what a decision PRODUCED onto the last entry in the log. Pure.
 *
 * The verdict is logged when it is honoured, which is before the thing it asked
 * for has happened — so the sha, and which path produced it, can only be added
 * afterwards. That is this function.
 *
 * WHAT WOULD FOOL THIS: it annotates the LAST entry, whatever that is. If a
 * second verdict is logged between the approval and its commit, the outcome
 * lands on the wrong one. Reaching that takes two review passes interleaved
 * against one sidecar, and the cost is a misfiled line in a history nothing
 * reads to decide anything — so it is accepted rather than guarded, and named
 * here so a later reader does not have to rediscover it.
 *
 * An empty log is left exactly as it was: there is no decision to describe, and
 * inventing one would put an outcome in the record with no decision behind it.
 */
function annotateLastDecision(notes, note) {
  const decisions = Array.isArray(notes.decisions) ? notes.decisions.slice() : []
  if (!decisions.length) return { notes, annotated: false }
  decisions[decisions.length - 1] = { ...decisions[decisions.length - 1], note }
  return { notes: { ...notes, decisions }, annotated: true }
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
  // The log is history and the merge rebuilds the object from scratch, so it
  // has to be carried across explicitly or every paste would erase it.
  if (Array.isArray(existing.decisions)) notes.decisions = existing.decisions.slice()
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

/**
 * What teardown says about a published page. PURE — url in, lines out.
 *
 * A published page is the ONE thing teardown cannot reclaim. The worktree goes,
 * the branch goes, the tracker assignment is released — and the page stays up,
 * because nothing in this tooling can delete it and nothing should pretend to.
 * So it is named, with where it can be removed, and that is the whole feature.
 *
 * Returns `[]` when the spec was never published, which is most specs. An
 * absence explained is noise: a teardown that mentions publishing to everyone
 * who never published is worse than one that says nothing.
 *
 * **Deliberately not a command, and never part of `run these:`.** There is no
 * command to run — removal is a person opening `/artifacts`. Folding it into the
 * batch would imply skitterspec could do it.
 */
function publishedPageNotice(url) {
  if (!url) return []
  return [
    '',
    '  published page survives this teardown — skitterspec cannot remove it:',
    `    ${url}`,
    '  delete it yourself: /artifacts in the terminal (o opens, c copies), or',
    '  the gallery at claude.ai/code/artifacts.',
  ]
}

/**
 * What to say about a review server at teardown. PURE — takes the facts as
 * arguments so a test states the world it describes.
 *
 * The server the operator never started is the one nobody remembers to stop:
 * `spec-env review` stands it up on a remote reader, and one path token unlocks
 * every provisioned spec's diff for as long as it runs. So teardown names it —
 * but only when there is genuinely nothing left for it to serve.
 *
 * `running` must come from a POSITIVE signal (`isAlive`), never from a pidfile
 * existing: a crashed process leaves one behind, and telling someone to stop a
 * server that is already gone is an accusation against a healthy teardown.
 */
function reviewServerNotice({ running, othersServed }) {
  if (!running || othersServed > 0) return []
  return [
    '',
    '  review server — this was the last spec it served:',
    '    skitterspec spec-env review serve --stop',
  ]
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
  VERDICTS,
  COMMITTING,
  readVerdict,
  DEFAULT_VERDICT,
  DELETED_HASH,
  fileHashes,
  reviewNotesPath,
  emptyNotes,
  readNotes,
  writeNotes,
  validateNotesBlob,
  validateResolutions,
  judgeVerdict,
  appendDecision,
  annotateLastDecision,
  reviewPendingPath,
  emptyPending,
  readPending,
  writePending,
  mintPendingCode,
  addPending,
  claimPending,
  describePending,
  pendingAge,
  PENDING_CODE_LENGTH,
  GATE_VERSION,
  DISARMED_BY,
  reviewGatePath,
  emptyGate,
  readGate,
  writeGate,
  armGate,
  disarmGate,
  gateState,
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
  publishedPageNotice,
  reviewServerNotice,
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
