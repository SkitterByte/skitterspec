'use strict'

/**
 * The verdict — what a review pass CONCLUDED, as opposed to what it marked.
 *
 * Two halves like the notes suite it sits beside. The pure functions
 * (`validateNotesBlob`'s verdict half, `judgeVerdict`, `appendDecision`) carry
 * the contract the page will be written against in phase 2. The CLI cases prove
 * the two things that are only true end to end: that a refused approval still
 * keeps the comments it arrived with, and that a blob carrying no verdict is
 * byte-identical to what this printed before verdicts existed.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  VERDICTS,
  DEFAULT_VERDICT,
  validateNotesBlob,
  validateResolutions,
  applyResolutions,
  judgeVerdict,
  appendDecision,
  annotateLastDecision,
  mergeNotes,
  applyNotes,
  emptyNotes,
  readNotes,
  writeNotes,
} = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-verdict-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  // `reader: local` for the same reason the notes suite states it: these tests
  // are about verdicts, and left to `detect` they stand a real server up
  // whenever the suite runs from a bridged or ssh session.
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local' } },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\nthree\n')
  fs.writeFileSync(path.join(dir, 'lib.js'), 'alpha\nbeta\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nthree\n')
  fs.writeFileSync(path.join(wt, 'lib.js'), 'alpha\nBETA\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

const review = (dir, ...extra) => runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])

async function reviewJson(dir, ...extra) {
  return JSON.parse(await review(dir, '--json', ...extra))
}

function blobFile(dir, blob) {
  const p = path.join(dir, 'blob.json')
  fs.writeFileSync(p, JSON.stringify({ version: 1, spec: 'feat-alpha', ...blob }))
  return p
}

function resolutionsFile(dir, list) {
  const p = path.join(dir, 'res.json')
  fs.writeFileSync(p, JSON.stringify(list))
  return p
}

const notesPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')
const notesOf = (dir) => JSON.parse(fs.readFileSync(notesPath(dir), 'utf8'))

const parse = (blob) => validateNotesBlob({ version: 1, spec: 'feat-alpha', ...blob }, 'feat-alpha')

// --- the verdict is validated, never coerced -------------------------------

test('each of the three verdicts validates, and an absent one is null', () => {
  for (const v of VERDICTS) {
    assert.strictEqual(parse({ verdict: v }).verdict, v, `${v} should validate`)
  }
  assert.strictEqual(parse({}).verdict, null, 'absent reads as null, not as a refusal')
  assert.strictEqual(parse({ verdict: null }).verdict, null, 'an explicit null is the same as absent')
})

test('an unknown verdict is refused by name rather than read as discuss', () => {
  // The failure this forbids: a typo'd verdict dropped like any other unknown
  // key, silently behaving as `discuss` — a review that quietly did nothing.
  for (const bad of ['aprove', 'APPROVE', '', 'reject', 3, true, ['commit']]) {
    assert.throws(
      () => parse({ verdict: bad }),
      /verdict .* is not one of commit, commit-continue, continue, changes, discuss/,
      `should refuse ${JSON.stringify(bad)}`,
    )
  }
})

// --- what a verdict does ---------------------------------------------------

function notesWith(comments, resolutions = []) {
  let notes = mergeNotes(emptyNotes('feat-alpha'), parse({ comments }), 'T1')
  if (resolutions.length) notes = applyResolutions(notes, validateResolutions(resolutions), 'T2').notes
  return notes
}

test('an absent verdict behaves as discuss, without the blob being rewritten', () => {
  const parsed = parse({ comments: [{ id: 'c1', file: 'app.js', note: 'hm' }] })
  assert.strictEqual(parsed.verdict, null, 'the pass records what was actually sent')
  const judged = judgeVerdict(parsed.verdict, notesWith(parsed.comments))
  assert.strictEqual(judged.effective, DEFAULT_VERDICT)
  assert.strictEqual(judged.effective, 'discuss')
  assert.strictEqual(judged.sent, null, 'the default is applied at use, not written back')
})

test('a committing verdict is refused while a comment is open, and names the count and the files', () => {
  const notes = notesWith([
    { id: 'c1', file: 'app.js', note: 'this' },
    { id: 'c2', file: 'app.js', note: 'and this' },
    { id: 'c3', file: 'lib.js', note: 'that' },
  ])
  const judged = judgeVerdict('commit', notes)
  assert.strictEqual(judged.honoured, false)
  assert.strictEqual(judged.openCount, 3)
  assert.deepStrictEqual(judged.openFiles, ['app.js', 'lib.js'], 'each file once, in the order met')
  assert.match(judged.reason, /3 comments are unresolved \(app\.js, lib\.js\)/)
  assert.strictEqual(judged.sent, 'commit', 'what was asked for is still reported')
  assert.strictEqual(
    judged.effective,
    'discuss',
    'the one we cannot honour routes to the harmless branch, not to the commit',
  )
})

test('a resolved comment stops blocking, so answering the notes is what unblocks approve', () => {
  const notes = notesWith([{ id: 'c1', file: 'app.js', note: 'this' }], [{ id: 'c1', note: 'fixed' }])
  const judged = judgeVerdict('commit', notes)
  assert.strictEqual(judged.honoured, true)
  assert.strictEqual(judged.openCount, 0)
})

test('approve with only unaccepted files is ALLOWED — ticks are never counted', () => {
  // The counting gate this feature exists not to become. An unticked file is
  // something you said nothing about; only a comment is a request you made.
  const files = [{ path: 'app.js' }, { path: 'lib.js' }, { path: 'untouched.js' }]
  const notes = mergeNotes(emptyNotes('feat-alpha'), parse({ accepted: [{ path: 'app.js', hash: 'h' }] }), 'T1')
  applyNotes(files, notes, new Map([['app.js', 'h']]))
  assert.deepStrictEqual(
    files.map((f) => f.accepted),
    [true, false, false],
    'two of three files were never ticked',
  )
  assert.strictEqual(judgeVerdict('commit', notes).honoured, true, 'and the approval stands anyway')
})

test('changes and discuss are never refused, however many notes are open', () => {
  const notes = notesWith([{ id: 'c1', file: 'app.js', note: 'x' }])
  for (const v of ['changes', 'discuss']) {
    assert.strictEqual(judgeVerdict(v, notes).honoured, true, `${v} does not block`)
  }
})

// --- the outcome log -------------------------------------------------------

test('the outcome log appends rather than replaces', () => {
  let notes = emptyNotes('feat-alpha')
  assert.ok(!('decisions' in notes), 'empty notes carry no log')
  notes = appendDecision(notes, { verdict: 'changes', at: 'T1' })
  notes = appendDecision(notes, { verdict: 'commit', at: 'T2', note: 'commit abc1234' })
  // `code` names the pass a claim consumed, and is honestly null where there
  // was none — a pasted blob, or a verdict that never went through the holding
  // area at all.
  assert.deepStrictEqual(notes.decisions, [
    { verdict: 'changes', at: 'T1', note: null, code: null },
    { verdict: 'commit', at: 'T2', note: 'commit abc1234', code: null },
  ])
  assert.strictEqual(notes.updatedAt, 'T2')
})

test('the log survives a merge, a resolution and a round-trip through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-log-'))
  try {
    const out = path.join(dir, 'feat-alpha.html')
    let notes = appendDecision(emptyNotes('feat-alpha'), { verdict: 'changes', at: 'T1' })
    notes = mergeNotes(notes, parse({ comments: [{ id: 'c1', file: 'app.js', note: 'x' }] }), 'T2')
    assert.strictEqual(notes.decisions.length, 1, 'a later paste does not erase the log')
    notes = applyResolutions(notes, validateResolutions([{ id: 'c1', note: 'done' }]), 'T3').notes
    writeNotes(out, notes)
    const back = readNotes(out, 'feat-alpha')
    assert.deepStrictEqual(back.notes.decisions, [{ verdict: 'changes', at: 'T1', note: null, code: null }])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a sidecar written without a log gains no `decisions` key just by being read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-log-'))
  try {
    const out = path.join(dir, 'feat-alpha.html')
    writeNotes(out, mergeNotes(emptyNotes('feat-alpha'), parse({ accepted: [{ path: 'a.js', hash: 'h' }] }), 'T1'))
    const back = readNotes(out, 'feat-alpha')
    assert.ok(!('decisions' in back.notes), 'absent stays absent for everyone not using verdicts')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- end to end, through the CLI -------------------------------------------

test('a refused commit still lands every comment it arrived with', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(
      dir,
      '--notes',
      blobFile(dir, {
        verdict: 'commit',
        accepted: [{ path: 'lib.js', hash: 'whatever' }],
        comments: [{ id: 'c1', file: 'app.js', line: 2, note: 'rename this' }],
      }),
    )
    assert.match(out, /commit refused — 1 comment is unresolved \(app\.js\)/)
    assert.match(out, /merged: 1 accept, 0 withdrawn, 1 comment/, 'the merge happened anyway')

    const notes = notesOf(dir)
    assert.strictEqual(notes.comments.length, 1, 'the note is on disk, not thrown away with the verdict')
    assert.ok(!('decisions' in notes), 'a refused verdict is not logged as a decision taken')

    // And it is genuinely a re-paste away: answer the note, approve again.
    await review(dir, '--resolve', resolutionsFile(dir, [{ id: 'c1', note: 'renamed' }]))
    const second = await review(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    assert.match(second, /· committing with/)
    assert.deepStrictEqual(
      notesOf(dir).decisions.map((d) => d.verdict),
      ['commit'],
      'only the honoured verdict reached the log',
    )
  } finally {
    cleanup(dir)
  }
})

test('--json carries the verdict as sent, whether it was honoured, and why not', async () => {
  const { dir } = scaffold()
  try {
    const refused = await reviewJson(
      dir,
      '--notes',
      blobFile(dir, { verdict: 'commit', comments: [{ id: 'c1', file: 'app.js', note: 'no' }] }),
    )
    assert.deepStrictEqual(refused.verdict, {
      sent: 'commit',
      effective: 'discuss',
      honoured: false,
      reason: '1 comment is unresolved (app.js)',
      openCount: 1,
      openFiles: ['app.js'],
      commitWith: '/commit',
    })

    const asked = await reviewJson(dir, '--notes', blobFile(dir, { verdict: 'changes' }))
    assert.strictEqual(asked.verdict.effective, 'changes')
    assert.strictEqual(asked.verdict.honoured, true)
    assert.strictEqual(asked.verdict.reason, null)
  } finally {
    cleanup(dir)
  }
})

test('a note raised and answered in the same run does not block the approval', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(
      dir,
      '--notes',
      blobFile(dir, { verdict: 'commit', comments: [{ id: 'c1', file: 'app.js', note: 'x' }] }),
      '--resolve',
      resolutionsFile(dir, [{ id: 'c1', note: 'done in the same breath' }]),
    )
    assert.match(out, /· committing with/, 'judged after the resolutions land, not before')
  } finally {
    cleanup(dir)
  }
})

test('a verdict with nothing else to report still says itself', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    assert.match(out, /notes: 0 accepted · 0 lapsed · 0 open · 0 resolved · committing with/)
  } finally {
    cleanup(dir)
  }
})

// --- stays silent ----------------------------------------------------------

test('a blob with no verdict behaves exactly as it did before verdicts existed', async () => {
  const { dir } = scaffold()
  try {
    const blob = blobFile(dir, {
      accepted: [{ path: 'app.js', hash: 'h' }],
      comments: [{ id: 'c1', file: 'lib.js', note: 'look at this' }],
    })
    const human = await review(dir, '--notes', blob)
    // Anchored to the line the verdict would be said on, because the temp path
    // in every other line legitimately contains the word.
    const notesLine = human.split('\n').find((l) => l.startsWith('  notes:'))
    assert.strictEqual(
      notesLine,
      '  notes: 0 accepted · 1 lapsed · 1 open · 0 resolved',
      'the line ends where it always did',
    )

    const json = await reviewJson(dir, '--notes', blob)
    assert.ok(!('verdict' in json), 'no key appears in --json either')
    assert.ok(!('decisions' in notesOf(dir)), 'and the sidecar gains nothing')
  } finally {
    cleanup(dir)
  }
})

test('a render with no blob at all is untouched by any of this', async () => {
  const { dir } = scaffold()
  try {
    const json = await reviewJson(dir)
    assert.ok(!('verdict' in json))
    assert.ok(!fs.existsSync(notesPath(dir)), 'reading a spec that has no notes writes no sidecar')
  } finally {
    cleanup(dir)
  }
})

// --- the log reaches the page ----------------------------------------------

test('the page data carries the last decision, and only once there is one', async () => {
  const { dir } = scaffold()
  try {
    const before = await reviewJson(dir, '--notes', blobFile(dir, { accepted: [] }))
    // A pass that reached no verdict adds no key. The page renders exactly as
    // it did before any of this existed, for everyone who is not using it.
    assert.ok(!('lastDecision' in before.notes), 'absent stays absent')

    await review(dir, '--notes', blobFile(dir, { verdict: 'discuss' }))
    const approved = await reviewJson(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    // The LAST one, not the first: the page has one question to answer with it.
    assert.strictEqual(approved.notes.lastDecision.verdict, 'commit')
    assert.strictEqual(approved.notes.lastDecision.note, null)
    assert.ok(approved.notes.lastDecision.at, 'the log is dated')
  } finally {
    cleanup(dir)
  }
})

test('a refused approval leaves the page showing the last HONOURED decision', async () => {
  const { dir } = scaffold()
  try {
    await review(dir, '--notes', blobFile(dir, { verdict: 'discuss' }))
    const refused = await reviewJson(
      dir,
      '--notes',
      blobFile(dir, {
        verdict: 'commit',
        comments: [{ id: 'c9', file: 'src/a.js', note: 'not this' }],
      }),
    )
    assert.strictEqual(refused.verdict.honoured, false)
    // The refused approval did not happen, so the page must not show it as the
    // last thing decided — that would be a trail of decisions never taken.
    assert.strictEqual(refused.notes.lastDecision.verdict, 'discuss')
  } finally {
    cleanup(dir)
  }
})

// --- the hand-off, and what the decision produced ---------------------------

test('an honoured commit names the skill it hands off to', async () => {
  const { dir } = scaffold()
  try {
    const json = await reviewJson(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    assert.strictEqual(json.verdict.honoured, true)
    // The skill routes on this rather than reading the config itself: one
    // answer, from the engine that owns the key.
    assert.strictEqual(json.verdict.commitWith, '/commit', 'the default')
    const said = await review(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    assert.match(said, /committing with \/commit/)
  } finally {
    cleanup(dir)
  }
})

test('review.commitWith is configurable, and "none" says so', async () => {
  const { dir } = scaffold()
  try {
    const cfg = path.join(dir, 'specs', '.core', 'env.config.json')
    const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'))
    parsed.review.commitWith = 'none'
    fs.writeFileSync(cfg, JSON.stringify(parsed, null, 2))

    const json = await reviewJson(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    assert.strictEqual(json.verdict.commitWith, 'none')
    // The verdict is still honoured — "none" disables the COMMIT, not the
    // approval. The decision is recorded either way.
    assert.strictEqual(json.verdict.honoured, true)
    assert.strictEqual(json.notes.lastDecision.verdict, 'commit')
    const said = await review(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    assert.doesNotMatch(said, /commit with/, 'nothing to hand off to')
  } finally {
    cleanup(dir)
  }
})

test('an empty commitWith leaves the default standing', () => {
  // Disabling the hand-off is a decision and is spelled "none". Deleting the
  // text between the quotes must not silently stop commits happening.
  const { loadEnvConfig, DEFAULT_CONFIG } = require('../src/env/config.js')
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-commitwith-')))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ review: { commitWith: '   ' } }),
  )
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.review.commitWith, DEFAULT_CONFIG.review.commitWith)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('--outcome writes what the decision produced onto the log', async () => {
  const { dir } = scaffold()
  try {
    await review(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    const json = await reviewJson(dir, '--outcome', 'committed a1b2c3d via /commit')
    assert.strictEqual(json.outcome, 'committed a1b2c3d via /commit')
    assert.strictEqual(json.notes.lastDecision.note, 'committed a1b2c3d via /commit')
    assert.strictEqual(json.notes.lastDecision.verdict, 'commit', 'the decision itself is untouched')
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT: an outcome with no decision behind it is a record of something
// nobody chose, so it is reported and dropped rather than inventing an entry.
test('--outcome with no decision logged writes nothing and says so', async () => {
  const { dir } = scaffold()
  try {
    const said = await review(dir, '--outcome', 'committed a1b2c3d')
    assert.match(said, /no decision to record an outcome against/)
    assert.ok(!fs.existsSync(notesPath(dir)) || !notesOf(dir).decisions, 'no log was invented')
  } finally {
    cleanup(dir)
  }
})

test('annotateLastDecision touches only the last entry', () => {
  const base = appendDecision(
    appendDecision(emptyNotes('feat-alpha'), { verdict: 'discuss', at: 'T1' }),
    { verdict: 'commit', at: 'T2' },
  )
  const { notes, annotated } = annotateLastDecision(base, 'committed a1b2c3d by hand')
  assert.strictEqual(annotated, true)
  assert.deepStrictEqual(notes.decisions[0], { verdict: 'discuss', at: 'T1', note: null, code: null })
  assert.strictEqual(notes.decisions[1].note, 'committed a1b2c3d by hand')
  // Pure: the input is not mutated.
  assert.strictEqual(base.decisions[1].note, null)

  const empty = annotateLastDecision(emptyNotes('feat-alpha'), 'nothing to hang this on')
  assert.strictEqual(empty.annotated, false)
  assert.ok(!empty.notes.decisions, 'an empty log stays empty')
})

// --- the vocabulary names the action (feat-verdict-is-the-action phase 1) ----
//
// `approve` became `commit`, and `commit-continue` joined it. The rename is not
// cosmetic: an approval that only recorded itself was the one control on a
// review page that did not describe what it does, and a review is the guard in
// front of an action.

test('the five verdicts are the actions, and an absent one still means discuss', () => {
  assert.deepStrictEqual(VERDICTS, ['commit', 'commit-continue', 'continue', 'changes', 'discuss'])
  assert.strictEqual(DEFAULT_VERDICT, 'discuss')
  for (const v of VERDICTS) assert.strictEqual(parse({ verdict: v }).verdict, v)
  // Compatibility, not taste: an absent verdict has meant discuss since
  // `feat-review-verdict`, and a pass that chose nothing must keep doing what
  // it always did.
  assert.strictEqual(parse({}).verdict, null)
  assert.strictEqual(judgeVerdict(null, emptyNotes('feat-alpha')).effective, 'discuss')
})

// TOLERANCE, NOT MIGRATION. These sidecars are gitignored, so there is no fleet
// to migrate and no script anyone would run — the rename is absorbed at every
// read, where it cannot be skipped.
test('a stored or sent `approve` reads as `commit` everywhere it can appear', () => {
  const { readVerdict, describePending, addPending, emptyPending, appendDecision } = require('../src/env/review.js')

  assert.strictEqual(readVerdict('approve'), 'commit')
  // Anything else passes through untouched: deciding an unknown word is wrong
  // is `validateNotesBlob`'s job, not this one's.
  for (const v of ['changes', 'discuss', 'commit-continue', 'aprove', null, undefined]) {
    assert.strictEqual(readVerdict(v), v)
  }

  // On the way in, through the validator — a page that has not been reloaded
  // still sends the old word, and a stale tab must land a committed review
  // rather than a rejected one.
  assert.strictEqual(parse({ verdict: 'approve' }).verdict, 'commit')

  // Out of the holding area, where the operator is offered the word.
  const held = addPending(emptyPending('feat-alpha'), {
    blob: { verdict: 'approve' }, at: '2026-01-01T00:00:00.000Z', render: 'R1',
  })
  assert.strictEqual(describePending(held.pending)[0].verdict, 'commit')

  // And when judged.
  assert.strictEqual(judgeVerdict('approve', emptyNotes('feat-alpha')).effective, 'commit')
  assert.ok(appendDecision(emptyNotes('feat-alpha'), { verdict: 'commit', at: 'T' }).decisions.length)
})

// ONE LIST, ONE REFUSAL. A fourth verdict must not become a way around the
// single block this engine makes — adding a committing verdict means adding it
// to `COMMITTING`, and the block follows for free.
test('both committing verdicts are blocked by the same open comment', () => {
  const { COMMITTING } = require('../src/env/review.js')
  assert.deepStrictEqual(COMMITTING, ['commit', 'commit-continue'])

  const notes = mergeNotes(
    emptyNotes('feat-alpha'),
    parse({ comments: [{ id: 'c1', file: 'app.js', note: 'this first' }] }),
    'T',
  )
  for (const v of COMMITTING) {
    const judged = judgeVerdict(v, notes)
    assert.strictEqual(judged.honoured, false, `${v} is blocked`)
    assert.strictEqual(judged.effective, 'discuss', `${v} routes to the harmless branch`)
    assert.strictEqual(judged.sent, v, 'and what was asked for is still reported')
  }
  // The two that ask for something are never blocked by it.
  for (const v of ['changes', 'discuss']) {
    assert.strictEqual(judgeVerdict(v, notes).honoured, true, `${v} is not a commit`)
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). Unaccepted files still block
// nothing — `feat-review-verdict` Decisions 1 and 3 are untouched here, and a
// new verdict must not become an excuse to revisit them.
test('stays silent: unaccepted files block neither committing verdict', () => {
  const { COMMITTING } = require('../src/env/review.js')
  // A pass that ticked nothing at all, which is the ordinary 60-file review.
  const notes = mergeNotes(emptyNotes('feat-alpha'), parse({}), 'T')
  for (const v of COMMITTING) {
    const judged = judgeVerdict(v, notes)
    assert.strictEqual(judged.honoured, true, `${v} needs no ticks`)
    assert.strictEqual(judged.openCount, 0)
  }
})

test('commit-continue says what it will do after committing', async () => {
  const { dir } = scaffold()
  try {
    const said = await review(dir, '--notes', blobFile(dir, { verdict: 'commit-continue' }))
    assert.match(said, /committing with \/commit, then the next phase/)
    const json = await reviewJson(dir, '--notes', blobFile(dir, { verdict: 'commit-continue' }))
    assert.strictEqual(json.verdict.effective, 'commit-continue')
    assert.strictEqual(json.verdict.honoured, true)
  } finally {
    cleanup(dir)
  }
})

// --- `continue`: the mid-run verdict ----------------------------------------

test('continue is a verdict, and is deliberately not a committing one', () => {
  const { VERDICTS, COMMITTING } = require('../src/env/review.js')
  assert.ok(VERDICTS.includes('continue'), 'the engine accepts the word')
  assert.ok(
    !COMMITTING.includes('continue'),
    'and it is structurally incapable of clearing a gate, rather than merely not doing so',
  )
})

test('a continue pass is stored, claimed and replayed like any other', async () => {
  const { dir } = scaffold()
  try {
    const said = await review(dir, '--notes', blobFile(dir, {
      verdict: 'continue',
      comments: [{ id: 'c1', file: 'app.js', note: 'worth a look later' }],
    }))
    assert.match(said, /read — carrying on, nothing committed/)

    const json = await reviewJson(dir)
    assert.strictEqual(json.verdict, undefined, 'a render with no pass reports no verdict')

    // The marks it arrived with are stored exactly as any other pass's are.
    const notes = notesOf(dir)
    assert.strictEqual(notes.comments.length, 1)
    assert.strictEqual(notes.comments[0].note, 'worth a look later')
    // And the decision is in the log as itself, not relabelled.
    assert.strictEqual(notes.decisions[notes.decisions.length - 1].verdict, 'continue')
  } finally {
    cleanup(dir)
  }
})

test('an open note does not block continue — the page must not out-refuse the engine', () => {
  // `changes` and `discuss` are always available because a note you want acted
  // on, and a question, are never the wrong thing to send. `continue` joins
  // them: the single refusal this engine makes is about COMMITTING, and
  // widening it here would make the page's disabled button a second opinion.
  const notes = notesWith([{ id: 'c1', file: 'app.js', note: 'this first' }])
  const judged = judgeVerdict('continue', notes)
  assert.strictEqual(judged.honoured, true)
  assert.strictEqual(judged.effective, 'continue')
  assert.strictEqual(judged.openCount, 1, 'the note is still counted and reported')
})

test('a continue pressed against an armed gate leaves it armed', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(['spec-env', 'review', 'arm', 'feat-alpha', '--dir', dir, '--phase', '1'])
    const armed = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(armed.state, 'armed', 'the gate is the thing under test — it must start armed')

    const said = await review(dir, '--notes', blobFile(dir, { verdict: 'continue' }))
    assert.doesNotMatch(said, /gate/i, 'nothing about the gate was touched')

    const after = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(
      after.state,
      'armed',
      'a phase that ended still owes a committing verdict or a recorded skip',
    )

    // And the contrast, so this asserts something about `continue` rather than
    // about a gate nothing can clear.
    await review(dir, '--notes', blobFile(dir, { verdict: 'commit' }))
    const cleared = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(cleared.state, 'clear', 'a committing verdict is what clears it')
  } finally {
    cleanup(dir)
  }
})

// --- the button set ---------------------------------------------------------

test('the button set is declared by the render, and an unknown one is refused by name', async () => {
  const { dir } = scaffold()
  try {
    const said = await review(dir, '--buttons', 'midrun')
    assert.match(said, /2 files/, 'the page is rendered exactly as it is without the flag')
    const json = await reviewJson(dir, '--buttons', 'midrun')
    assert.strictEqual(json.buttons, 'midrun')

    const bad = await review(dir, '--buttons', 'mid-run')
    assert.match(bad, /--buttons "mid-run" is not one of committing, midrun/)
    assert.match(bad, /nothing rendered/)
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). The payload is the only part of a
// render that varies — the template is the same bytes for every page — so a
// payload that gains no key is a page that renders as it rendered before any of
// this existed. Naming the default explicitly must be the same thing as not
// asking, or `--buttons committing` would quietly become an opt-in.
test('stays silent: a render with no flag, and one naming the default, add no key at all', async () => {
  const { dir } = scaffold()
  try {
    const bare = await reviewJson(dir)
    assert.ok(!('buttons' in bare), 'a caller that did not ask renders what it always rendered')

    const named = await reviewJson(dir, '--buttons', 'committing')
    assert.ok(!('buttons' in named), 'asking for the default is not an opt-in')
  } finally {
    cleanup(dir)
  }
})

// The rejected alternative in decision 4: deriving the set from the gate is
// tidier and wrong, because a project that opted out never arms and would
// therefore never be offered a committing verdict at all.
test('the button set follows the flag and not the gate, including where the gate never arms', async () => {
  const { dir } = scaffold()
  try {
    // A project that opted out of gating entirely.
    const cfg = path.join(dir, 'specs', '.core', 'env.config.json')
    const config = JSON.parse(fs.readFileSync(cfg, 'utf8'))
    config.review = { ...config.review, required: false }
    fs.writeFileSync(cfg, JSON.stringify(config, null, 2))

    const gate = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.notStrictEqual(gate.state, 'armed', 'this project never arms — that is the point of the case')

    const committing = await reviewJson(dir)
    assert.ok(!('buttons' in committing), 'and its pages still offer the committing set')

    const midrun = await reviewJson(dir, '--buttons', 'midrun')
    assert.strictEqual(midrun.buttons, 'midrun', 'while the flag, and only the flag, moves it')
  } finally {
    cleanup(dir)
  }
})
