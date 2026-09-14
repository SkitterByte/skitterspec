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
  for (const bad of ['aprove', 'APPROVE', '', 'reject', 3, true, ['approve']]) {
    assert.throws(
      () => parse({ verdict: bad }),
      /verdict .* is not one of approve, changes, discuss/,
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

test('approve is refused while a comment is open, and names the count and the files', () => {
  const notes = notesWith([
    { id: 'c1', file: 'app.js', note: 'this' },
    { id: 'c2', file: 'app.js', note: 'and this' },
    { id: 'c3', file: 'lib.js', note: 'that' },
  ])
  const judged = judgeVerdict('approve', notes)
  assert.strictEqual(judged.honoured, false)
  assert.strictEqual(judged.openCount, 3)
  assert.deepStrictEqual(judged.openFiles, ['app.js', 'lib.js'], 'each file once, in the order met')
  assert.match(judged.reason, /3 comments are unresolved \(app\.js, lib\.js\)/)
  assert.strictEqual(judged.sent, 'approve', 'what was asked for is still reported')
  assert.strictEqual(
    judged.effective,
    'discuss',
    'the one we cannot honour routes to the harmless branch, not to the commit',
  )
})

test('a resolved comment stops blocking, so answering the notes is what unblocks approve', () => {
  const notes = notesWith([{ id: 'c1', file: 'app.js', note: 'this' }], [{ id: 'c1', note: 'fixed' }])
  const judged = judgeVerdict('approve', notes)
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
  assert.strictEqual(judgeVerdict('approve', notes).honoured, true, 'and the approval stands anyway')
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
  notes = appendDecision(notes, { verdict: 'approve', at: 'T2', note: 'commit abc1234' })
  assert.deepStrictEqual(notes.decisions, [
    { verdict: 'changes', at: 'T1', note: null },
    { verdict: 'approve', at: 'T2', note: 'commit abc1234' },
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
    assert.deepStrictEqual(back.notes.decisions, [{ verdict: 'changes', at: 'T1', note: null }])
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

test('a refused approval still lands every comment it arrived with', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(
      dir,
      '--notes',
      blobFile(dir, {
        verdict: 'approve',
        accepted: [{ path: 'lib.js', hash: 'whatever' }],
        comments: [{ id: 'c1', file: 'app.js', line: 2, note: 'rename this' }],
      }),
    )
    assert.match(out, /approve refused — 1 comment is unresolved \(app\.js\)/)
    assert.match(out, /merged: 1 accept, 0 withdrawn, 1 comment/, 'the merge happened anyway')

    const notes = notesOf(dir)
    assert.strictEqual(notes.comments.length, 1, 'the note is on disk, not thrown away with the verdict')
    assert.ok(!('decisions' in notes), 'a refused verdict is not logged as a decision taken')

    // And it is genuinely a re-paste away: answer the note, approve again.
    await review(dir, '--resolve', resolutionsFile(dir, [{ id: 'c1', note: 'renamed' }]))
    const second = await review(dir, '--notes', blobFile(dir, { verdict: 'approve' }))
    assert.match(second, /· approved/)
    assert.deepStrictEqual(
      notesOf(dir).decisions.map((d) => d.verdict),
      ['approve'],
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
      blobFile(dir, { verdict: 'approve', comments: [{ id: 'c1', file: 'app.js', note: 'no' }] }),
    )
    assert.deepStrictEqual(refused.verdict, {
      sent: 'approve',
      effective: 'discuss',
      honoured: false,
      reason: '1 comment is unresolved (app.js)',
      openCount: 1,
      openFiles: ['app.js'],
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
      blobFile(dir, { verdict: 'approve', comments: [{ id: 'c1', file: 'app.js', note: 'x' }] }),
      '--resolve',
      resolutionsFile(dir, [{ id: 'c1', note: 'done in the same breath' }]),
    )
    assert.match(out, /· approved/, 'judged after the resolutions land, not before')
  } finally {
    cleanup(dir)
  }
})

test('a verdict with nothing else to report still says itself', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(dir, '--notes', blobFile(dir, { verdict: 'approve' }))
    assert.match(out, /notes: 0 accepted · 0 lapsed · 0 open · 0 resolved · approved/)
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
