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
 * Is this path one of `folder`'s own spec documents, in any bucket?
 *
 * Every bucket, for the same reason `classifyDirtyTree` checks every bucket: a
 * tree mid-`git mv` is dirty in two of them at once and both halves are the
 * same spec's.
 *
 * It exists because `isNoise` above is exactly wrong for the `docs` mode. That
 * rule — everything under `specs/` is bookkeeping — is right for a phase's code
 * diff, where the spec's own checkbox edits are not what anyone came to read.
 * On a page whose SUBJECT is the spec, applying it folds away every file and
 * renders a page with nothing open on it.
 */
function isSpecDocOf(relPath, folder) {
  const parts = String(relPath).split('/')
  return parts.length > 3 && parts[0] === 'specs' && parts[2] === folder
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
 * **This decides two things: the WORDING, and WHAT THE SERVER BINDS TO.** It
 * does not decide *whether* to serve — `review.serve` does — and it never
 * decides to publish. Being wrong therefore stays cheap in both directions: a
 * wrong `local` binds loopback, which is reachable from the machine holding the
 * page and says so; a wrong `remote` binds every interface, which is the
 * existing behaviour and is announced on the render.
 *
 * IT DID DECIDE WHETHER TO SERVE, ONCE, and this comment claimed otherwise
 * throughout — the sentence above used to read "nothing in the engine serves on
 * the strength of it" while `cli.js` served only for a `remote` reader. The bill
 * was a `file://` link on a local machine, and a `file://` page has no server to
 * POST to, so the verdict buttons on it had nowhere to go: the loop the page
 * exists to close was absent from the sessions easiest to use. If you are here
 * wondering whether to make detection load-bearing again, that is what it cost
 * the last time, and `env-serve-start-proof` now fails if you do.
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
 *
 * `buttons` is the button set the page renders — see `BUTTON_SETS`. It is the
 * caller's declaration about the work, not a reading of the gate.
 */
function collectReview({ spec, git, mode = 'working', ref, base = null, now, notes = null, gate = null, fellBack = false, buttons = null, only = null, treePath = null, live = null, tiers = null }) {
  // WHICH TREE THE SPEC'S OWN DOCUMENTS ARE READ FROM. Every render but one
  // reads the spec's worktree, and for those the two are the same path — so
  // `treePath` left null keeps the existing behaviour exactly. The `docs` mode
  // has no worktree to read, which is the whole reason it exists.
  const root = treePath || spec.worktreePath

  // AN EXPLICIT FILE SET, or every changed file. `only` is a whitelist of
  // repo-relative paths, and it exists because the `docs` mode reads a tree
  // several sessions write into: rendering everything uncommitted there would
  // put another spec's documents on this page and then commit them under this
  // page's verdict. Null — every other caller — filters nothing.
  const wanted = only ? new Set(only) : null
  const keep = (f) => !wanted || wanted.has(f.path)

  // WHAT COUNTS AS BOOKKEEPING, and it inverts for the `docs` mode. Everywhere
  // else the spec's own documents are the bookkeeping beside the code; on a
  // docs page they are the code, and the companions the project declared (a
  // tracker snapshot, say) are what belongs folded away.
  const noiseOf = (p) => (mode === 'docs' ? !isSpecDocOf(p, spec.folder) : isNoise(p))

  // THE SURFACES BLOCK, built here so the page never has to know which tiers
  // exist or which of them can be turned on. `null` when the caller passed
  // neither a live state nor a stack — an absent key, not an empty one.
  const surfaces = surfacesFor({ live, tiers, buttons })

  const files = []
  for (const f of trackedFiles(git, ref)) {
    if (!keep(f)) continue
    const { patch, whole } = patchFor(git, ref, f, false)
    const { additions, deletions, binary } = numstatFor(git, ref, f, false)
    files.push({ ...f, additions, deletions, binary, whole, noise: noiseOf(f.path), patch })
  }
  for (const f of untrackedFiles(git)) {
    if (!keep(f)) continue
    const { patch, whole } = patchFor(git, ref, f, true)
    const { additions, deletions, binary } = numstatFor(git, ref, f, true)
    files.push({ ...f, additions, deletions, binary, whole, noise: noiseOf(f.path), patch })
  }

  // NOTHING TO BE BOOKKEEPING BESIDE. The flag is relative — a spec's own
  // checkbox edits are not what anyone came to read WHEN THERE IS A DIFF TO
  // READ — and applying it with no relative left folds the whole change away,
  // rendering a page whose subject is invisible until the reader happens to
  // click a file in the tree. A change that is entirely bookkeeping IS the
  // change, so it opens.
  //
  // WHAT WOULD FOOL A LOOSER VERSION OF THIS: one source file in the diff. The
  // test is EVERY file, so the moment there is something else to read the
  // margin notes go back to being margin notes — which is the flag's whole
  // point and has its own stays-silent test.
  if (files.length && files.every((f) => f.noise)) {
    for (const f of files) f.noise = false
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
  const specDir = root ? findSpecDirIn(root, spec.folder) : null
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
    // The tree the diff was read from. Identical to the worktree for every
    // mode but `docs`, where there is no worktree and this is the checkout the
    // documents actually live in — saying `worktree` there would name a path
    // that does not exist.
    worktree: root,
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
    // Same rule again: a gate that was never armed and never skipped adds no
    // key at all.
    ...(gateForPage(gate) ? { gate: gateForPage(gate) } : {}),
    // THE PATHS A COMMITTING VERDICT HERE MUST COMMIT, carried on the payload
    // so the skill that routes on the verdict never recomputes them. It matters
    // that they travel with the page rather than being asked for again: a
    // checkout is shared, so the set of this spec's uncommitted documents can
    // differ between the render and the verdict — and the reader's conclusion is
    // about what the page showed them.
    //
    // Absent for every other mode, which is what keeps their payloads identical.
    ...(only ? { docs: { paths: only } } : {}),
    // WHERE ELSE THIS REVIEW CAN BE REACHED, and whether it is also running.
    //
    // The page had no idea the other tiers existed — it is opened AT one URL
    // and knows nothing about the rest — so an enable press needs somewhere to
    // live, and that is this block. It carries only what the reader can act on:
    // the live state, each tier that is OFF with the action that turns it on,
    // and the `network` URL when it is on, which is the one address a reader
    // wants that is not the one they are standing on.
    //
    // ABSENT STAYS ABSENT, exactly as `phases` and `gate` do: a caller that
    // passes neither renders the payload it rendered before this existed.
    ...(surfaces ? { surfaces } : {}),
    // THE DEFAULT ADDS NO KEY, so a caller that did not ask for a button set —
    // and a caller that asked for the default by name — renders the payload it
    // rendered before this existed. Opting in is the only thing that shows.
    ...(buttons && buttons !== DEFAULT_BUTTON_SET ? { buttons } : {}),
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
 * the action: `commit`, `commit-continue`, `commit-start`, `changes`,
 * `discuss`.
 *
 * `commit-start` is the authoring verdict: commit the spec that was just
 * written, then put it in flight. It is its own word rather than a
 * context-dependent reading of `commit-continue` for exactly the reason above —
 * a verdict that means `/spec-start` on one page and `/spec-next` on another
 * names neither, and the outcome log would record the same word for two
 * different actions with no way to tell them apart afterwards.
 *
 * `discuss` is the default because it is the behaviour that existed before any
 * verdict did. So a blob from an older page, or one a reader sent without
 * choosing, keeps doing exactly what it always did.
 *
 * `commit-land` is the `/no-spec` verdict: commit this work, fast-forward the
 * base branch to it, and tear the worktree down. It is its own word for exactly
 * the reason `commit-start` is — reusing plain `commit` would make one verdict
 * mean "commit and stop" on a phase page and "commit, land and destroy the
 * worktree" on a `/no-spec` page, which is the context-dependent reading this
 * vocabulary exists to prevent. The outcome log would then record the same word
 * for two very differently destructive actions.
 *
 * `continue` is the mid-run verdict: *I have read it, carry on*. It names an
 * action, which is what separates it from the `none` verdict that was removed —
 * `none` recorded itself and did nothing, while this one resumes the run. What
 * it does NOT do is commit, so it is deliberately absent from `COMMITTING`
 * below and is therefore structurally incapable of clearing an armed gate: a
 * phase that ended still owes a committing verdict or a recorded skip.
 */
const VERDICTS = [
  'commit',
  'commit-continue',
  'commit-start',
  'commit-land',
  'continue',
  'changes',
  'discuss',
]
const DEFAULT_VERDICT = 'discuss'

/**
 * Actions the page can send INSTEAD of a verdict.
 *
 * AN ACTION IS NOT A VERDICT, and keeping the two vocabularies apart is the
 * whole point rather than tidiness. A verdict is a conclusion about the work,
 * consumed once by the thing it asked for. An action changes what is *running*
 * — or which tiers are permitted — and then puts the reader back on the same
 * page with the same options, so a run answering one has concluded nothing.
 *
 * THERE IS NO `live-off`, and its absence is the decision. Putting *this* change
 * live is about the diff on screen; handing the whole instance back to `main` is
 * a workspace decision with nothing to do with this review, and a control for it
 * on a review page invites the reader to make it while thinking about something
 * else. The `live:` line names `/spec-live main` instead, which is what a person
 * types.
 *
 * Three consequences follow from that, and all three are structural rather than
 * remembered:
 *
 * - It is absent from `VERDICTS`, so nothing that routes on a verdict can see
 *   it.
 * - It is absent from `COMMITTING`, so it is **incapable** of clearing an armed
 *   gate: a phase that ended still owes a verdict after the reader has looked
 *   at it running. The commit that a `live-on` performs first is the mechanical
 *   precondition for `live take` (which refuses a dirty worktree), not the
 *   reader's answer.
 * - A blob may carry a verdict or an action, never both. Two answers in one
 *   pass would need a rule about which wins, and any such rule would sometimes
 *   act on the half the reader did not mean.
 *
 * `allow-network`/`allow-remote` turn a review TIER on, and they exist here
 * because the page can now act — which is the premise
 * `feat-three-review-links` decision 5 rejected a page toggle on, having
 * recorded it as open to reopening. Two things replace the limit it rested on.
 * **Only a reader who can already reach the page can press one**, so widening
 * loopback→network can only be pressed from the machine itself, where the
 * command was available anyway, and the serve token still decides who reaches
 * the page at all. And `allow-remote` **permits publishing without
 * publishing** — the permanent claude.ai page still takes an explicit ask.
 *
 * There is no disable direction, and `tierAction` is where that is enforced:
 * turning `network` off from a page reached over the network kills the page
 * doing the turning.
 */
const ACTIONS = ['live-on', 'allow-network', 'allow-remote']

/**
 * The action a tier that is OFF offers, or null.
 *
 * ENABLE-ONLY, and that is a decision rather than an omission: turning
 * `network` off from a page you reached over the network kills the page doing
 * the turning, and the reader gains nothing they could not get by typing the
 * command. `local` has no setting at all — it is the machine the page is on.
 */
function tierAction(tier) {
  if (!tier || !tier.off) return null
  if (tier.tier === 'network') return 'allow-network'
  if (tier.tier === 'remote') return 'allow-remote'
  return null
}

/**
 * What the page shows above the verdicts: where this review can be reached, and
 * whether it is also running. Pure.
 *
 * ONLY WHAT THE READER CAN ACT ON. An `on` tier the reader is already standing
 * on is not information — they are reading it — so the only tier URL carried is
 * `network`'s, which is the one address someone on a laptop wants for their
 * phone. Everything else here is a state plus the one press that changes it.
 *
 * `null` RATHER THAN AN EMPTY BLOCK when there is nothing to say: an
 * `unavailable` live state and no stack means a caller that never asked, and
 * the payload must then be byte-identical to what it was before this key
 * existed.
 */
function surfacesFor({ live, tiers, buttons = null }) {
  // A MID-PHASE PAGE CANNOT PUT ANYTHING LIVE, so it is not offered the press.
  //
  // `live take` refuses a dirty worktree, so the action commits the phase
  // first — and `/spec-diff` §2b is explicit that half a phase is not
  // committed to look at it running: that splits one phase across two commits
  // and leaves a mess nobody asked for. So mid-run the press could only ever be
  // declined, and a control that always refuses teaches the reader that the
  // buttons on this page are decorative — the same failure
  // `.claude/rules/spec-reports.md` records for the offer nothing was watching.
  //
  // The row stays, with the command in place of the button: the reader still
  // learns the surface exists and what to type, which is exactly the trade the
  // strip already makes on a `file://` page.
  //
  // ONLY `live-on`. `allow-network` and `allow-remote` write a config file
  // and commit nothing, so they are as valid mid-phase as at the end of one.
  const canCommit = buttons !== 'midrun'
  const rows = []

  // `unavailable` contributes nothing — the cannot-tell state, routed to
  // silence exactly as `liveStateLine` routes it (`env/live.js`).
  if (live && live.state && live.state !== 'unavailable') {
    rows.push({
      kind: 'live',
      state: live.state,
      url: live.url || null,
      reason: live.reason || null,
      // ONE DIRECTION ONLY. `off` offers the press; `on` and `held` offer none —
      // `on` because handing the instance back to `main` is not this review's
      // business, and `held` because the way out is another spec's to take and a
      // button here would either park someone else's work or do nothing.
      action: live.state === 'off' && canCommit ? 'live-on' : null,
      // The command for the direction the page does not offer, so the reader is
      // never left knowing what they want and not what to type. Mid-run that is
      // `/spec-live` itself, since the press is withheld above.
      command:
        live.state === 'on' ? '/spec-live main' : live.state === 'off' && !canCommit ? '/spec-live' : null,
    })
  }

  for (const t of tiers || []) {
    const action = tierAction(t)
    // ONLY WHAT THE READER CAN ACT ON. An `on` tier contributes nothing: the
    // reader is standing on one of them, and the terminal render is where they
    // got the link — printing it again here would be two places naming one page,
    // which is the split `.claude/rules/spec-reports.md` records as a failure.
    if (!action) continue
    rows.push({
      kind: 'tier',
      tier: t.tier,
      state: 'off',
      url: null,
      // SAID BEFORE THE PRESS, not after it. Unlike the live action, which
      // touches no tracked file, `allow` edits `specs/.core/env.config.json` in
      // the primary checkout — changing behaviour for everyone who pulls and
      // leaving that tree dirty. A setting change of that reach must not land
      // because someone tapped a button labelled only `Allow remote`.
      note: t.note || 'writes env.config.json — committed, and shared',
      // The same thing from a terminal, for the reader who is nowhere near the
      // page. Only `remote` has a command of its own: `network` is ON by
      // default, so turning it off is a rare deliberate act and a slash command
      // per tier is clutter for the one nobody touches.
      command: t.tier === 'remote' ? '/spec-remote-review' : null,
      action,
    })
  }

  return rows.length ? rows : null
}

/**
 * The three review tiers, in a FIXED ORDER, each either a URL or the reason it
 * is not one. Pure: it takes what the caller already resolved.
 *
 * Fixed order matters more than it looks. A reader who has learnt which line
 * their phone opens should not have to re-read the labels every render, and a
 * stack that reordered itself by availability would make them.
 *
 * WHY A STACK AT ALL, when the rule said exactly one link: the engine cannot
 * know where the reader is sitting, and every attempt to guess failed the
 * moment they moved. `local` and `network` are two doors into ONE room — the
 * page POSTs to `location.pathname`, so both reach the same server and the same
 * pending store, and one wait covers both. `remote` is a second store, which is
 * why it carries the line saying so.
 */
function reviewTierStack({ served, fileUrl, publishedUrl, config }) {
  const tiers = []
  const loopbackUrl = served && served.loopbackUrl ? served.loopbackUrl : null

  tiers.push(
    loopbackUrl
      ? { tier: 'local', url: loopbackUrl }
      : { tier: 'local', url: fileUrl, note: 'a file:// page cannot send a verdict' },
  )

  if (!config.review.allowNetwork) {
    tiers.push({ tier: 'network', off: true, enable: 'skitterspec spec-env review allow network' })
  } else if (served && !served.loopback && served.url) {
    tiers.push({ tier: 'network', url: served.url, alternates: served.alternates || [] })
  } else {
    // Permitted, but there is no address to offer — a machine with no network,
    // or a server that could not take one. Not a problem to report as an error.
    tiers.push({ tier: 'network', unavailable: true, note: 'no network address on this machine' })
  }

  if (!config.review.allowRemote) {
    // THE COMMAND A PERSON TYPES. `/spec-remote-review` toggles, so the same
    // line works whichever way the tier currently is — and nobody has to
    // reconstruct `spec-env review allow remote` from a render they are reading
    // on a phone.
    tiers.push({ tier: 'remote', off: true, enable: '/spec-remote-review' })
  } else if (publishedUrl) {
    tiers.push({ tier: 'remote', url: publishedUrl, note: 'a verdict here needs /spec-reviewed' })
  } else {
    tiers.push({ tier: 'remote', unavailable: true, note: 'publishing is an ask — nothing published yet' })
  }

  return tiers
}

// One tier as a line, padded so the labels form a column the eye can run down.
function reviewTierLine(t) {
  const label = `  ${t.tier}:`.padEnd(11)
  if (t.url) return `${label}${t.url}${t.note ? `   (${t.note})` : ''}`
  if (t.off) return `${label}off — turn on with: ${t.enable}`
  return `${label}—   (${t.note})`
}


// The verdicts that COMMIT, and are therefore blocked by an open comment. One
// list, so a fifth verdict cannot become a way around the single refusal this
// engine makes — adding a committing verdict means adding it here, and the
// block follows for free.
//
// `continue` IS DELIBERATELY NOT HERE, and that omission is the whole of
// decision 2: waiting is what any offer does, while arming asserts an
// obligation that outlives the turn. A mid-run reader saying "carry on" has
// answered the offer in front of them and nothing else, so the gate a finished
// phase armed must survive it untouched.
const COMMITTING = ['commit', 'commit-continue', 'commit-start', 'commit-land']

/**
 * Which set of buttons a rendered page shows.
 *
 * DECLARED BY THE CALLER, NEVER DERIVED FROM THE GATE. Deriving it — mid-run
 * iff the gate is unarmed — is tidier and wrong: a project running
 * `review.required: false` never arms at all, so every one of its pages would
 * lose the committing buttons and the reader could never commit from the page.
 * The caller knows whether the work it just rendered is finished; the gate only
 * knows whether this project opted into gating.
 *
 * `committing` is the default, so a caller that says nothing keeps today's page
 * exactly — the key is left off the payload entirely rather than written out as
 * the default, so an unchanged caller renders an unchanged page.
 *
 * `authoring` is the set for a spec that has just been written: its committing
 * pair is `commit-start` and `commit` — put it in flight now, or keep it for
 * later. `commit-continue` is absent because there is no phase in flight to
 * continue, and `continue` is absent because the run has nothing left to resume.
 *
 * `refresh` is the set for a spec that was re-validated rather than written:
 * `commit`, `changes`, `discuss`, and NO start verdict. A refreshed spec may
 * already be in progress, so offering to put it in flight would be wrong for
 * half this set's inputs — and wrong in the expensive direction, since it would
 * offer to provision a worktree for a spec that already has one.
 *
 * `nospec` is the set for work with no spec document: its committing pair is
 * `commit-land` and `commit` — finish it now, or commit and leave the branch
 * standing. `commit-continue` is absent because there is no next phase, and
 * `commit-start` because there is nothing to put in flight.
 *
 * REUSING `refresh` HERE WAS THE OBVIOUS MOVE AND IT IS WRONG. The three
 * remaining buttons are identical, so the temptation is to let `/no-spec` take
 * that set and treat plain `commit` as "commit, land, tear down". That makes one
 * verdict word mean two different things depending on which skill rendered the
 * page — precisely what having separate words for `commit-start` and
 * `commit-continue` exists to avoid, and worse here, because one of the two
 * readings destroys a worktree.
 *
 * `fix` is the set for a SINGLE-PASS fix — a bug or hotfix spec whose whole
 * repair is one `## Fix` list and no phase files. It is `committing` minus
 * `commit-continue`, because there is no next phase for `/spec-next` to build:
 * the page used to offer that verb anyway, the press committed correctly, and
 * `/spec-next` then refused with nothing to do.
 *
 * THE PAGE ALREADY HAS A GUARD FOR THIS AND IT CANNOT SEE THESE SPECS. It dims
 * the button on `data.phases.hasNextPhase === false`, and `readPhases` returns
 * `null` for a folder with no phase files — deliberately, because that is also
 * a legacy layout whose phases live inline in the overview. So the caller says
 * it instead, which is what the `buttons` parameter is for.
 *
 * REUSING `refresh` WAS THE OBVIOUS MOVE HERE TOO, and is wrong for the reason
 * above one line up rather than the one above the paragraph: the three buttons
 * are identical, but `refresh` means a re-validated spec DOCUMENT and this is a
 * render of code. The word is stored in the render record and read back by the
 * serve daemon, so one name covering two renders would be ambiguous exactly
 * where it is used to decide something.
 */
const BUTTON_SETS = ['committing', 'midrun', 'authoring', 'refresh', 'nospec', 'fix']
const DEFAULT_BUTTON_SET = 'committing'

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

// Beside the page and the notes sidecar, under gitignored `.spec-env/`. The
// suffix is named once so the cross-spec scan recognises a store by the same
// spelling that writes one.
const PENDING_SUFFIX = '.pending.json'

function reviewPendingPath(outPath) {
  return outPath.replace(/\.html$/, '') + PENDING_SUFFIX
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
 * What became of ONE pass, by its code. Reads; writes nothing, refuses nothing.
 *
 * The served page POSTs, is handed six digits, and then has to end on one of
 * two sentences — Claude picked this up, or here is the command that picks it
 * up. It cannot know which at send time, so it asks, and this answers.
 *
 * Three states, and the third is the point:
 *
 * - `waiting` — the code IS in the holding area. Nobody has claimed it.
 * - `claimed` — the decision log NAMES the code. Somebody did.
 * - `unknown` — neither could be established.
 *
 * BOTH ANSWERS REST ON SOMETHING PRESENT, which is what stops this being the
 * fourth row in the table at the top of `.claude/rules/negative-checks.md`. The
 * tempting cheap version reads `claimed` off the code being ABSENT from the
 * holding area — and absence there has four causes, of which exactly one is a
 * claim: `--drop` removes a pass and writes no decision, a store written under
 * a different `--out` is a store this never opens, and a mistyped folder finds
 * an empty one. Three of those four would report a pass as picked up while it
 * sits in a file nobody is reading, which is this spec's own bug told back to
 * the reader with confidence.
 *
 * So `unknown` answers everything that is not a positive signal, and the caller
 * turns it back into the command. That direction is deliberate: a command
 * nobody needed to run costs a glance, and a pass nobody claims costs the
 * review.
 *
 * A code that is not six digits never reaches disk. It cannot be one this
 * engine minted, so there is nothing to look up, and answering it from the
 * filesystem would make a reachable endpoint into a path-shaped probe.
 */
function passState(outPath, specFolder, code) {
  const wanted = typeof code === 'string' ? code.trim() : ''
  if (!new RegExp(`^\\d{${PENDING_CODE_LENGTH}}$`).test(wanted)) return { state: 'unknown' }

  const held = readPending(outPath, specFolder)
  // A store we could not parse is not an empty one. It holds somebody's passes
  // and we simply cannot see them, so neither answer is available.
  if (held.corrupt) return { state: 'unknown' }
  if ((held.pending.passes || []).some((p) => p && p.code === wanted)) return { state: 'waiting' }

  const stored = readNotes(outPath, specFolder)
  if (stored.corrupt) return { state: 'unknown' }
  const decisions = Array.isArray(stored.notes.decisions) ? stored.notes.decisions : []
  if (decisions.some((d) => d && d.code === wanted)) return { state: 'claimed' }

  // Gone from the holding area and unnamed in the log. It may have been
  // dropped, it may predate this field, the store may not be the one the page
  // was served from. Say so.
  return { state: 'unknown' }
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
      // AN ACTION IS REPORTED AS AN ACTION. A pass carrying one has no verdict,
      // and listing it as `no verdict` would describe the instruction it does
      // carry as an absence — which is the reading that makes a reader claim it
      // expecting a conclusion.
      action: (p.blob && p.blob.action) || null,
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

/**
 * Which pass arrived inside a WAIT WINDOW. Pure — it selects, never claims.
 *
 * THE WINDOW IS THE SCOPE, and it is what replaces "a person typed the
 * command" when a watch wakes the session instead. A skill that asked to be
 * woken when the store changed knows one thing nothing else does: the moment
 * it started waiting. A pass sent after that, while it was waiting, is the
 * pass it was waiting for — and a pass that was already there is a stranger's,
 * or an older sitting's, and must not be swept up by a wait that was not about
 * it.
 *
 * Three answers, and only one of them acts:
 *
 * - exactly one in the window → that is the pass, named by its code.
 * - none → nothing to claim. Ordinary: the watch can fire on a write that was
 *   not a pass at all.
 * - more than one → REFUSE and name the count, never pick. Two people, or two
 *   sittings, landed in one window; choosing between them is exactly the guess
 *   `claimPending` refuses to make, and the operator has the codes.
 *
 * A pass whose `at` cannot be parsed is never in the window. That is the
 * cannot-tell case routed to inaction (`.claude/rules/negative-checks.md` rule
 * 4): including it would auto-claim a pass whose age — the one tell a stranger
 * has — could not be established.
 */
function passesSince(pending, since) {
  const from = Date.parse(since)
  if (!Number.isFinite(from)) return { codes: [], usable: false }
  const codes = (pending.passes || [])
    .filter((p) => {
      const at = Date.parse(p.at)
      return Number.isFinite(at) && at >= from
    })
    .map((p) => p.code)
  return { codes, usable: true }
}

/* ==========================================================================
 * The wait — one implementation, because improvised ones cannot be tested
 *
 * The skills used to say "watch the pending store and end your turn" and stop
 * there, so every run wrote its own watcher in shell. Three failed in two days,
 * each reaching the operator as "I pressed the button and nothing happened" —
 * and the worst of them was `until [ -f "$P" ] && [ "$x" \\> "$y" ]`, valid bash
 * and a syntax error in zsh, which spun for five minutes writing to a stderr
 * nobody reads.
 *
 * What made that expensive was not the typo. It is that SILENCE WAS THE SUCCESS
 * SIGNAL: from outside, a watcher that can never fire and one patiently working
 * look exactly alike. So the comparison lives here, in one place, where a test
 * can hand it a store that gains a pass mid-flight and watch it return.
 * ========================================================================== */

const WAIT_POLL_MS = 400

// How often a running wait says it is still running. Five minutes, against a
// 400ms poll: this is not part of the poll at all, it is proof of life for
// whatever is supervising the process.
const WAIT_HEARTBEAT_MS = 5 * 60 * 1000

/**
 * Block until exactly one pass arrives inside a window. Impure only in that it
 * reads the store and sleeps; it writes nothing and claims nothing.
 *
 * Four outcomes, and they are distinct because the caller acts differently on
 * each:
 *
 * - `{ state: 'arrived', code }` — one pass, inside the window. Claim it.
 * - `{ state: 'ambiguous', count }` — more than one. NAMES NO CODE, because
 *   choosing between two is exactly the guess `claimPending` refuses to make.
 * - `{ state: 'timeout' }` — only when a timeout was asked for.
 * - `{ state: 'unusable' }` — the window could not be parsed, so there is
 *   nothing to wait inside. Returns AT ONCE rather than blocking forever on a
 *   comparison that can never be satisfied — which is the failure this whole
 *   function exists to stop.
 *
 * NO TIMEOUT UNLESS ASKED. `timeoutMs` omitted means wait as long as the
 * process lives, and that is the default the skills use: any fixed number is a
 * guess about how long someone reads, and a reader who walks away from a diff
 * is the normal case rather than the edge one. An hour was picked once and a
 * lunch break beat it.
 *
 * IT SAYS IT IS STILL RUNNING, on `onHeartbeat`. A backgrounded wait produced
 * no output between starting and finding a pass, and over a long idle it was
 * killed — three sessions lost their wait over one lunch break. Whether the
 * trigger is process silence or session idleness was never established, so the
 * cheap half is done here: the process stops being silent. The other half is
 * the caller re-arming, which covers it either way.
 *
 * The cadence is INDEPENDENT of the poll. Polling stays at 400ms because that
 * is how fast a press should be noticed; the heartbeat is minutes apart because
 * it is addressed to a supervisor, not to a reader.
 *
 * WHAT WOULD FOOL A LOOSER VERSION: treating an absent, empty, or older-only
 * store as a reason to return. None of those is a pass — they are the ordinary
 * state of a review nobody has answered yet — and a wait that ended on one
 * would report "no pass" as an outcome (`.claude/rules/negative-checks.md`
 * rule 3 has a test for each).
 */
async function waitForPass(
  readStore,
  since,
  {
    timeoutMs = null,
    pollMs = WAIT_POLL_MS,
    sleep,
    onHeartbeat = null,
    heartbeatMs = WAIT_HEARTBEAT_MS,
    now = () => Date.now(),
  } = {},
) {
  if (!Number.isFinite(Date.parse(since))) return { state: 'unusable' }
  const nap = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const startedAt = now()
  const deadline = Number.isFinite(timeoutMs) && timeoutMs !== null ? startedAt + timeoutMs : null
  // Counted from the start rather than scheduled, so a slow poll cannot make
  // the heartbeat drift and a fast one cannot make it fire twice.
  let beats = 0

  for (;;) {
    // A store that will not parse is not an empty one, and it is not a pass
    // either — keep waiting rather than reading someone's unreadable passes as
    // an answer. `readPending` already reports `corrupt` rather than throwing.
    const read = readStore()
    if (read && !read.corrupt) {
      const window = passesSince(read.pending, since)
      if (window.usable) {
        if (window.codes.length === 1) return { state: 'arrived', code: window.codes[0] }
        if (window.codes.length > 1) return { state: 'ambiguous', count: window.codes.length }
      }
    }
    if (deadline !== null && now() >= deadline) return { state: 'timeout' }

    // SAID ON THE WAY ROUND, never on the way out. A line printed when the wait
    // ends would only ever appear for the waits that already worked, which is
    // the half that never needed proof.
    if (onHeartbeat && heartbeatMs > 0) {
      const elapsed = now() - startedAt
      const due = Math.floor(elapsed / heartbeatMs)
      if (due > beats) {
        beats = due
        onHeartbeat({ elapsedMs: elapsed, since })
      }
    }

    // Never overshoot the deadline by a whole poll interval.
    await nap(deadline === null ? pollMs : Math.max(0, Math.min(pollMs, deadline - now())))
  }
}

/**
 * Every waiting pass, across every spec. Reads; writes, claims and refuses
 * nothing.
 *
 * A wait that never fired, a session cleared, a terminal closed overnight —
 * none of those is recoverable by any watcher, however good. This is what finds
 * the pass afterwards, so recovery stops depending on the operator happening to
 * suspect something.
 *
 * IT READS THE SIDECAR DIRECTORY, NEVER THE PROVISIONED LIST, and that is the
 * load-bearing decision rather than an implementation detail. `specEnvStatus`
 * walks specs that have a **worktree**; the ten passes that motivated this all
 * belonged to specs that had been completed and torn down. Scoping the scan to
 * provisioned specs would therefore make it blind to precisely the case that
 * produced it. A `<spec>.pending.json` is here because a pass was received —
 * a positive signal (`.claude/rules/negative-checks.md` rule 1), and one that
 * outlives the spec's worktree, its branch and its folder.
 *
 * WHAT WOULD FOOL THIS: a store that will not parse. It holds someone's passes
 * and reading it as empty would report "nothing waiting", which is the one
 * answer that is certainly wrong — so it comes back named in `unreadable`
 * rather than counted as zero (rule 4).
 *
 * Oldest first and stable, ties broken on the code, exactly as
 * `describePending` orders one spec's own.
 */
function waitingPasses(reviewsDirPath) {
  let entries
  try {
    entries = fs.readdirSync(reviewsDirPath)
  } catch {
    // No directory means no review has ever been rendered here. That is the
    // ordinary state of a fresh repo, not a failure to report.
    return { passes: [], unreadable: [] }
  }

  const passes = []
  const unreadable = []
  for (const name of entries.sort()) {
    if (!name.endsWith(PENDING_SUFFIX)) continue
    const folder = name.slice(0, -PENDING_SUFFIX.length)
    // The engine's own reader, so "corrupt" means here what it means everywhere.
    const read = readPending(path.join(reviewsDirPath, `${folder}.html`), folder)
    if (read.corrupt) {
      unreadable.push(folder)
      continue
    }
    for (const pass of read.pending.passes || []) {
      if (pass && pass.code) {
        passes.push({
          spec: folder,
          code: pass.code,
          verdict: readVerdict(pass.blob && pass.blob.verdict),
          action: (pass.blob && pass.blob.action) || null,
          at: pass.at || null,
        })
      }
    }
  }
  passes.sort((a, b) => {
    const at = String(a.at || '').localeCompare(String(b.at || ''))
    return at !== 0 ? at : a.code.localeCompare(b.code)
  })
  return { passes, unreadable }
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

/**
 * The reason a BYPASS records, and it is deliberately a fixed string.
 *
 * A skip normally carries what the operator typed. This one is chosen from a
 * picker with nothing typed, so the record has to say that for itself — and a
 * string nobody would write by hand is what keeps a tapped bypass tellable from
 * a considered one when both appear in the same log.
 *
 * It stays `by: 'skip'` rather than minting a third `DISARMED_BY` verb: the
 * sidecar's vocabulary is versioned, and a distinct reason already buys the only
 * thing a third verb would have.
 */
const GATE_BYPASS_REASON = 'none: chose to commit without reading the diff'

/**
 * The way out of an armed gate, declared beside the refusal rather than left
 * for a caller to reconstruct.
 *
 * A BYPASS, NOT A SATISFY: the phase still owes a verdict and nobody has read
 * it, so this steps past a guard that is still unsatisfied — which is exactly
 * why it is recorded and a `satisfy` is not.
 *
 * WHAT THIS IS NOT: a `--force`. One was asked for and rejected, because a
 * reasonless lift is indistinguishable from nobody having looked. The exits
 * this gate has are unchanged — a committing verdict, or a recorded skip — and
 * this is the second of those two at an address a person will actually reach.
 */
const GATE_BYPASS_OFFER = Object.freeze({
  kind: 'bypass',
  label: 'Commit without reading the diff — recorded as such',
  command: `skitterspec spec-env review skip "${GATE_BYPASS_REASON}"`,
})

// How a disarm happened. `verdict` is a review that reached a committing
// conclusion; `skip` is the operator saying, on the record, that they are
// moving on without one.
const DISARMED_BY = ['verdict', 'skip']

function reviewGatePath(outPath) {
  return outPath.replace(/\.html$/, '') + '.gate.json'
}

function emptyGate(specFolder) {
  return { version: GATE_VERSION, spec: specFolder, armed: false, armedAt: null, phase: null, offeredAt: null, log: [] }
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
        // A sidecar written before this field existed reads as never-offered,
        // which is the correct and harmless default. These files are gitignored,
        // so there is no fleet to migrate and `GATE_VERSION` does not move.
        offeredAt: parsed.offeredAt || null,
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

/* ==========================================================================
 * The render record — what the caller DECLARED, for the re-render to read
 * ========================================================================== */

// Same stem as the other sidecars, so one spec's set still reads as one set.
function renderRecordPath(outPath) {
  return outPath.replace(/\.html$/, '') + '.render.json'
}

/**
 * The button set the last CLI render of this spec declared, or null.
 *
 * WHY THIS EXISTS AT ALL. `--buttons` is declared by the caller — `BUTTON_SETS`
 * above says why it is never derived — and the review daemon is not that
 * caller. It re-renders a spec's page per request from the tree, so without a
 * record it can only guess, and what it guessed was the default: every
 * `/no-spec` page served over http offered `Commit & Start`.
 *
 * WHAT WOULD FOOL A CONSUMER THAT TRUSTED THIS OUTRIGHT: it is a file on disk
 * and the tree moves underneath it. A spec rendered as `--docs` and then put in
 * flight has a day-old record saying `authoring` and a worktree saying
 * otherwise. So `buttonsForView` in `serve.js` takes only NARROWING words from
 * here and reads the family off the tree — this function's job is to report
 * what was written, not to decide whether it still holds.
 *
 * Three states, like `readNotes` and `readGate`: absent is the ordinary case,
 * and corrupt is reported rather than hidden so neither reads as a declaration.
 */
function readRenderRecord(outPath, specFolder) {
  let raw
  try {
    raw = fs.readFileSync(renderRecordPath(outPath), 'utf8')
  } catch {
    // Absent is ordinary: most pages are opened off the index without the CLI
    // ever having rendered that spec.
    return { buttons: null, corrupt: false, present: false }
  }
  try {
    const parsed = JSON.parse(raw)
    const buttons = typeof parsed.buttons === 'string' && parsed.buttons ? parsed.buttons : null
    // The folder is checked, not trusted: a record found under this spec's stem
    // that names another spec is not this spec's declaration.
    if (parsed.spec && specFolder && parsed.spec !== specFolder) {
      return { buttons: null, corrupt: false, present: true }
    }
    return { buttons, corrupt: false, present: true }
  } catch {
    return { buttons: null, corrupt: true, present: true }
  }
}

function writeRenderRecord(outPath, record) {
  const p = renderRecordPath(outPath)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + '\n')
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
  // Idempotent within a phase — a re-render must not restart the clock, and it
  // must not hand back an offer this arming has already spent.
  if (gate.armed && gate.phase === phase) return gate
  // A NEW ARMING GETS A NEW OFFER. Each phase that ends is its own obligation,
  // so the once-only rule is scoped to the arming rather than to the file.
  return { ...gate, armed: true, armedAt: at, phase, offeredAt: null }
}

/**
 * Record that the bypass was offered for this arming. Pure.
 *
 * SPENT BY BEING MADE, not by being taken. A reader who declines still saw it,
 * and re-offering on the next refused commit is how a bypass becomes the default
 * rather than a deliberate step.
 *
 * NOT DONE AS A SIDE EFFECT OF READING THE GATE, deliberately. `/spec-next`
 * asks `review gate --json` on every single run, so a read that spent the
 * offer would burn it with no picker ever raised — and the operator would never
 * be offered the thing this exists to offer them.
 *
 * Marking an unarmed gate changes nothing: there is no obligation, so there is
 * nothing to have offered a way out of.
 */
function markGateOffered(gate, { at }) {
  if (!gate.armed || gate.offeredAt) return { gate, marked: false }
  return { gate: { ...gate, offeredAt: at }, marked: true }
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
/**
 * What the page is told about the gate. Pure. `null` when there is nothing to
 * say, so a project that never armed one renders byte-identically to how it
 * did before any of this existed — the same rule `phases` and `context` follow.
 *
 * The last SKIP travels with it, because that is the page's answer to the one
 * question an untouched-looking review raises: was this read and moved past, or
 * never read at all? A verdict already had an answer there; a skip did not.
 */
function gateForPage(gate) {
  if (!gate) return null
  const log = Array.isArray(gate.log) ? gate.log : []
  const skips = log.filter((e) => e && e.by === 'skip')
  const lastSkip = skips.length ? skips[skips.length - 1] : null
  if (!gate.armed && !lastSkip) return null
  return {
    armed: gate.armed === true,
    armedAt: gate.armedAt || null,
    phase: gate.phase === undefined ? null : gate.phase,
    ...(lastSkip ? { lastSkip: { at: lastSkip.at || null, reason: lastSkip.reason || null } } : {}),
  }
}

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
  // The refusal is unchanged by the offer having been spent — what is withheld
  // is the way out, never the guard. A second refused commit still refuses, and
  // still names its exits in the text; the operator simply is not asked again.
  return {
    state: 'armed',
    reason: 'a phase is awaiting a verdict',
    gate,
    ...(gate.offeredAt ? {} : { offer: GATE_BYPASS_OFFER }),
  }
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
  // AN ACTION, refused by name for the same reason a misspelt verdict is: a
  // dropped `action: "live-onn"` would read as a pass carrying no instruction
  // at all, reported as if the press had been honoured.
  let action = null
  if (blob.action !== undefined && blob.action !== null) {
    if (typeof blob.action !== 'string' || !ACTIONS.includes(blob.action)) {
      fail(`action ${JSON.stringify(blob.action)} is not one of ${ACTIONS.join(', ')}`)
    }
    action = blob.action
  }
  if (action && verdict) {
    fail(`carries both a verdict (${verdict}) and an action (${action}) — send one`)
  }
  return { accepted, unaccepted, comments, verdict, action }
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
  const read = readVerdict(verdict) || null
  // A WORD THIS ENGINE DOES NOT KNOW IS NOT HONOURED AS ONE. Every door into
  // here validates first — `validateNotesBlob` refuses an unknown verdict by
  // name and refuses an action in the verdict slot, and `--verdict` checks the
  // list — so nothing reaches this today. It used to pass such a word straight
  // through with `honoured: true`, which routes cannot-tell to the branch that
  // acts (`.claude/rules/negative-checks.md` rule 4 inverted). Closing it costs
  // nothing and means a fifth door added later cannot reopen it.
  const sent = read && VERDICTS.includes(read) ? read : null
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
function appendDecision(notes, { verdict, at, note = null, code = null }) {
  const decisions = Array.isArray(notes.decisions) ? notes.decisions.slice() : []
  // `code` NAMES THE PASS this decision came out of, and it is the only present
  // thing anyone can assert to conclude that a pass was picked up. Four
  // different things make a code vanish from the holding area and only one of
  // them is a claim — `--drop` is another, a moved store and a mistyped folder
  // are two more — so `passState` reads this, and never reads an absence.
  //
  // `null` for every other path in: a pasted blob and a `--verdict` word carry
  // no code, and inventing one would put a pass in the record that never
  // existed.
  decisions.push({ verdict, at, note: note === undefined ? null : note, code: code || null })
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
  parts.push(...renderReviewerStrip(review.reviewers))
  const checks = Array.isArray(review.checks) ? review.checks : []
  if (checks.length) {
    parts.push('<ul class="checks">')
    checks.forEach((c, i) => {
      // An unknown level is shown as `confirm` rather than dropped: losing a
      // reviewer's note because it was tagged oddly is worse than showing it
      // under a neutral heading.
      const level = CHECK_LEVELS.includes(c.level) ? c.level : 'confirm'
      // `file:line` where a line is known, and the whole thing is a button so a
      // finding can be read against the code it is about. A check with no line
      // renders exactly as it always did — the written review supplies none, and
      // its output must not change because machine findings now exist.
      const hasLine = Number.isInteger(c.line) && c.line > 0
      const label = c.file ? escapeHtml(c.file) + (hasLine ? `:${c.line}` : '') : ''
      const file = c.file
        ? `<button type="button" class="check-file" data-goto="${escapeHtml(c.file)}"` +
          `${hasLine ? ` data-goto-line="${c.line}"` : ''}>${label}</button>`
        : ''
      // WHO SAID IT. Absent for a written review, which is what it has always
      // been; present the moment two authors can appear on one page, because a
      // reader weighing a finding needs to know whether a person read the code
      // or a tool matched a pattern.
      const src = c.source ? `<span class="check-src">${escapeHtml(c.source)}</span>` : ''
      // The id is positional and therefore stable for THIS render, which is all
      // a reply needs: it travels back in the same blob the page was built from.
      // `data-file` is what lets an answer land on the file the check is about.
      const id = `k${i}`
      const fileAttr = c.file ? ` data-file="${escapeHtml(c.file)}"` : ''
      const lineAttr = hasLine ? ` data-line="${c.line}"` : ''
      parts.push(
        `<li class="check ${level}" data-check="${id}"${fileAttr}${lineAttr}>` +
          `<span class="check-level">${level}</span>` +
          `${src}${file}<span class="check-note">${escapeHtml(c.note || '')}</span></li>`,
      )
    })
    parts.push('</ul>')
  }
  parts.push('</section>')
  return parts.join('\n')
}

/**
 * One line per configured reviewer, saying what its run ended as.
 *
 * PRESENT EVEN WHEN EVERY REVIEWER FOUND NOTHING, which is the whole point and
 * the one place `.claude/rules/negative-checks.md` inverts here. Silence is
 * normally the safe branch; on this page it is not, because a reviewer that was
 * rate-limited renders identically to one that read the diff and approved of it
 * — and the reader is about to decide whether to commit. So the strip reports
 * the RUN, which is a positive signal, rather than accusing the code.
 *
 * Absent entirely when no reviewer is configured: every project that exists
 * today is in that state, and a strip saying "no reviewers" would be an absence
 * reported at everyone.
 */
function renderReviewerStrip(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes : []
  if (!list.length) return []
  const parts = ['<ul class="reviewers">']
  for (const o of list) {
    const state = typeof o.state === 'string' ? o.state : 'failed'
    parts.push(
      `<li class="reviewer ${escapeHtml(state)}">` +
        `<span class="reviewer-name">${escapeHtml(o.name || 'reviewer')}</span>` +
        `<span class="reviewer-said">${escapeHtml(reviewerSaid(o))}</span></li>`,
    )
  }
  parts.push('</ul>')
  return parts
}

/**
 * What one reviewer's outcome reads as. Pure.
 *
 * A STATE THIS BUILD DOES NOT KNOW IS SHOWN, not dropped — the same rule the
 * check level follows. An unrecognised state means a newer engine wrote the
 * cache, and losing the line entirely would read as a reviewer that was never
 * configured.
 */
function reviewerSaid(o) {
  const n = Number.isInteger(o.count) ? o.count : 0
  const detail = o.detail ? ` — ${o.detail}` : ''
  switch (o.state) {
    case 'findings':
      return `${n} finding${n === 1 ? '' : 's'}${detail}`
    case 'cached':
      return n ? `${n} finding${n === 1 ? '' : 's'} · cached` : 'clean · cached'
    case 'clean':
      return 'clean'
    case 'missing':
      return `did not run${o.detail ? ` — ${o.detail}` : ''}`
    case 'timeout':
      return 'did not run — timed out'
    case 'failed':
      return `did not run${o.detail ? ` — ${o.detail}` : ''}`
    default:
      return `${o.state}${detail}`
  }
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

// The publish-ready copy, beside the page it came from. Same stem, so every
// sidecar (`.notes.json`, `.url`, `.publish.html`, `.render.json`) reads as one
// spec's set.
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
  ACTIONS,
  tierAction,
  surfacesFor,
  reviewTierStack,
  reviewTierLine,
  COMMITTING,
  BUTTON_SETS,
  DEFAULT_BUTTON_SET,
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
  PENDING_SUFFIX,
  emptyPending,
  readPending,
  writePending,
  mintPendingCode,
  addPending,
  claimPending,
  passesSince,
  waitingPasses,
  waitForPass,
  WAIT_HEARTBEAT_MS,
  WAIT_POLL_MS,
  passState,
  describePending,
  pendingAge,
  PENDING_CODE_LENGTH,
  GATE_VERSION,
  DISARMED_BY,
  reviewGatePath,
  emptyGate,
  readGate,
  writeGate,
  renderRecordPath,
  readRenderRecord,
  writeRenderRecord,
  armGate,
  disarmGate,
  gateState,
  markGateOffered,
  GATE_BYPASS_OFFER,
  GATE_BYPASS_REASON,
  gateForPage,
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
  renderReviewerStrip,
  reviewerSaid,
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
