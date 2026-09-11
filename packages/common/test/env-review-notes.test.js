'use strict'

/**
 * The review round-trip: accepts and comments made on the page, merged back
 * through `--notes` and read again at the next render.
 *
 * Two halves, deliberately. The pure functions (validate/merge/apply) are unit
 * tested, because their contract is the thing the page will be written against.
 * Everything about WHEN AN ACCEPT LAPSES needs a real git fixture: the whole
 * design rests on the claim that a content hash survives a commit and a mode
 * switch where a patch hash would not, and only real git can prove that.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  NOTES_VERSION,
  validateNotesBlob,
  mergeNotes,
  applyNotes,
  emptyNotes,
  readNotes,
  writeNotes,
  reviewNotesPath,
} = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-notes-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\nthree\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
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
  fs.writeFileSync(p, JSON.stringify(blob))
  return p
}

const notesOf = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json'), 'utf8'))

// --- the blob is untrusted input ------------------------------------------

test('a good blob validates, and unknown keys are ignored rather than refused', () => {
  const parsed = validateNotesBlob(
    {
      version: 1,
      spec: 'feat-alpha',
      somethingNewer: { from: 'a later page' },
      accepted: [{ path: 'app.js', hash: 'abc123' }],
      comments: [{ id: 'c1', file: 'app.js', line: 2, note: 'this' }],
    },
    'feat-alpha',
  )
  assert.strictEqual(parsed.accepted.length, 1)
  assert.strictEqual(parsed.comments.length, 1)
  assert.deepStrictEqual(parsed.unaccepted, [], 'an absent list reads as empty, not as a refusal')
})

test('every malformed shape is refused by name', () => {
  const cases = [
    [null, /not a JSON object/],
    [{ version: 2 }, /version 2/],
    [{ version: 1, spec: 'feat-other' }, /written for feat-other/],
    [{ version: 1, accepted: 'no' }, /accepted must be an array/],
    [{ version: 1, accepted: [{ path: 'a.js' }] }, /a\.js has no hash/],
    [{ version: 1, accepted: [{ hash: 'x' }] }, /has no path/],
    [{ version: 1, unaccepted: [3] }, /unaccepted entry must be a path/],
    [{ version: 1, comments: [{ file: 'a.js', note: 'x' }] }, /comment has no id/],
    [{ version: 1, comments: [{ id: 'c1', note: 'x' }] }, /c1 has no file/],
    [{ version: 1, comments: [{ id: 'c1', file: 'a.js', note: '   ' }] }, /c1 has no note/],
    [{ version: 1, comments: [{ id: 'c1', file: 'a.js', note: 'x', line: 1.5 }] }, /non-integer line/],
  ]
  for (const [blob, re] of cases) {
    assert.throws(() => validateNotesBlob(blob, 'feat-alpha'), re, `should refuse ${JSON.stringify(blob)}`)
  }
})

// --- merge, never replace --------------------------------------------------

test('re-pasting the same blob is idempotent, and keeps the history', () => {
  const blob = validateNotesBlob(
    {
      version: 1,
      accepted: [{ path: 'app.js', hash: 'h1' }],
      comments: [{ id: 'c1', file: 'app.js', note: 'first' }],
    },
    'feat-alpha',
  )
  const once = mergeNotes(emptyNotes('feat-alpha'), blob, 'T1')
  // A resolution written between the two pastes must survive the second.
  once.comments[0].resolved = { at: 'T1', note: 'done' }
  const twice = mergeNotes(once, blob, 'T2')
  assert.strictEqual(twice.comments.length, 1, 'the comment is merged by id, not appended again')
  assert.strictEqual(twice.comments[0].raisedAt, 'T1', 'when it was first raised is kept')
  assert.deepStrictEqual(twice.comments[0].resolved, { at: 'T1', note: 'done' }, 'the resolution survives')
  assert.strictEqual(Object.keys(twice.files).length, 1)
})

test('anything the blob does not mention is carried through untouched', () => {
  const existing = mergeNotes(
    emptyNotes('feat-alpha'),
    validateNotesBlob(
      { version: 1, accepted: [{ path: 'kept.js', hash: 'k' }], comments: [{ id: 'old', file: 'kept.js', note: 'x' }] },
      'feat-alpha',
    ),
    'T1',
  )
  const next = mergeNotes(
    existing,
    validateNotesBlob({ version: 1, accepted: [{ path: 'other.js', hash: 'o' }] }, 'feat-alpha'),
    'T2',
  )
  assert.ok(next.files['kept.js'], 'a file absent from the new blob keeps its accept')
  assert.strictEqual(next.comments.length, 1, 'an untouched comment is not dropped')
})

test('un-accepting is explicit, because absence means "not mentioned"', () => {
  const existing = mergeNotes(
    emptyNotes('feat-alpha'),
    validateNotesBlob({ version: 1, accepted: [{ path: 'app.js', hash: 'h' }] }, 'feat-alpha'),
    'T1',
  )
  const next = mergeNotes(existing, validateNotesBlob({ version: 1, unaccepted: ['app.js'] }, 'feat-alpha'), 'T2')
  assert.deepStrictEqual(next.files, {}, 'the withdrawn accept is gone')
})

// --- folding notes onto the collected files --------------------------------

test('a comment on a file that is no longer in the diff is surfaced, not lost', () => {
  const notes = mergeNotes(
    emptyNotes('feat-alpha'),
    validateNotesBlob({ version: 1, comments: [{ id: 'c1', file: 'vanished.js', note: 'x' }] }, 'feat-alpha'),
    'T1',
  )
  const files = [{ path: 'app.js' }]
  const { unanchored, totals } = applyNotes(files, notes, new Map([['app.js', 'h']]))
  assert.strictEqual(unanchored.length, 1, 'it is reported rather than dropped with its file')
  assert.strictEqual(totals.unresolved, 1)
})

test('a hash that could not be computed never reads as accepted', () => {
  const notes = mergeNotes(
    emptyNotes('feat-alpha'),
    validateNotesBlob({ version: 1, accepted: [{ path: 'app.js', hash: 'h' }] }, 'feat-alpha'),
    'T1',
  )
  const files = [{ path: 'app.js' }]
  applyNotes(files, notes, new Map([['app.js', null]]))
  assert.strictEqual(files[0].accepted, 'lapsed', 'cannot-tell routes to un-accepted, never to approval')
})

// --- the lapse rule, against real git --------------------------------------

test('an accept survives the commit that ends the phase, and the mode switch', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nthree\n')

    const before = await reviewJson(dir)
    const app = before.files.find((f) => f.path === 'app.js')
    assert.ok(app.hash, 'the file carries a content hash')
    assert.strictEqual(app.accepted, false)

    await review(dir, '--notes', blobFile(dir, { version: 1, spec: 'feat-alpha', accepted: [{ path: 'app.js', hash: app.hash }] }))

    // The phase ends: the work is committed, so HEAD moves and every patch in
    // `working` mode changes. THIS is where a patch-keyed accept would lapse.
    git(wt, 'add', '-A')
    git(wt, 'commit', '-q', '-m', 'phase 1')

    const after = await reviewJson(dir, '--branch')
    const same = after.files.find((f) => f.path === 'app.js')
    assert.strictEqual(same.hash, app.hash, 'the content did not change, so neither did its hash')
    assert.strictEqual(same.accepted, true, 'the accept survives the commit and the working -> branch switch')
    assert.strictEqual(after.notes.totals.accepted, 1)
    assert.strictEqual(after.notes.totals.lapsed, 0)
  } finally {
    cleanup(dir)
  }
})

test('changing an accepted file lapses the accept, and says so', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nthree\n')
    const first = await reviewJson(dir)
    const app = first.files.find((f) => f.path === 'app.js')
    await review(dir, '--notes', blobFile(dir, { version: 1, accepted: [{ path: 'app.js', hash: app.hash }] }))

    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nthree\nfour\n')
    const out = await review(dir)
    assert.match(out, /1 lapsed/, 'the lapse is announced in the report')

    const after = await reviewJson(dir)
    assert.strictEqual(after.files.find((f) => f.path === 'app.js').accepted, 'lapsed')
    assert.ok(
      after.files.find((f) => f.path === 'app.js').acceptedAt,
      'when it was accepted is kept, so the page can say "accepted earlier"',
    )
  } finally {
    cleanup(dir)
  }
})

test('an accept whose hash matches nothing is recorded as given, not rejected', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'changed\n')
    const out = await review(dir, '--notes', blobFile(dir, { version: 1, accepted: [{ path: 'app.js', hash: 'deadbeef' }] }))
    assert.match(out, /merged: 1 accept/, 'a stale tab is an ordinary input, not an error')
    assert.match(out, /1 lapsed/)
    assert.strictEqual(notesOf(dir).files['app.js'].acceptedHash, 'deadbeef', 'recorded exactly as sent')
  } finally {
    cleanup(dir)
  }
})

// --- the accusing checks: refuse, and write nothing -------------------------

test('a refused blob leaves no notes file behind at all', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'changed\n')
    const out = await review(dir, '--notes', blobFile(dir, { version: 1, spec: 'feat-other', accepted: [] }))
    assert.match(out, /written for feat-other/)
    assert.strictEqual(
      fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')),
      false,
      'nothing is written on a refusal, so no half-merge to unpick',
    )
  } finally {
    cleanup(dir)
  }
})

test('an unreadable notes file is ignored on render and never overwritten by a merge', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'changed\n')
    await review(dir) // creates .spec-env/reviews/
    const notesPath = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')
    fs.writeFileSync(notesPath, '{ this is not json')

    const rendered = await review(dir)
    assert.match(rendered, /not readable JSON — ignored, not overwritten/, 'the render says so and carries on')
    assert.match(rendered, /page: /, 'and still writes the page')

    const merged = await review(dir, '--notes', blobFile(dir, { version: 1, accepted: [] }))
    assert.match(merged, /move it aside and re-paste/, 'a merge refuses rather than destroying it')
    assert.strictEqual(fs.readFileSync(notesPath, 'utf8'), '{ this is not json', 'the file is untouched')
  } finally {
    cleanup(dir)
  }
})

// --- stays silent ----------------------------------------------------------

test('a spec with no notes reads exactly as it did before any of this existed', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'changed\n')
    const out = await review(dir)
    assert.doesNotMatch(out, /notes:/, 'no notes line')
    assert.doesNotMatch(out, /merged:/, 'no merge line')
    assert.doesNotMatch(out, /lapsed/, 'nothing is accused of being stale')

    const json = await reviewJson(dir)
    assert.strictEqual(json.notes.totals.accepted, 0)
    assert.deepStrictEqual(json.notes.unanchored, [])
    for (const f of json.files) {
      assert.strictEqual(f.accepted, false, `${f.path} is un-accepted, not lapsed`)
      assert.deepStrictEqual(f.comments, [])
    }
    assert.strictEqual(
      fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')),
      false,
      'rendering never creates a sidecar — only a merge does',
    )
  } finally {
    cleanup(dir)
  }
})

test('the sidecar sits beside the page, and round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-sidecar-'))
  try {
    const page = path.join(dir, 'reviews', 'feat-alpha.html')
    assert.strictEqual(reviewNotesPath(page), path.join(dir, 'reviews', 'feat-alpha.notes.json'))
    const notes = emptyNotes('feat-alpha')
    notes.comments.push({ id: 'c1', file: 'app.js', note: 'x' })
    writeNotes(page, notes)
    const back = readNotes(page, 'feat-alpha')
    assert.strictEqual(back.corrupt, false)
    assert.strictEqual(back.present, true)
    assert.strictEqual(back.notes.version, NOTES_VERSION)
    assert.strictEqual(back.notes.comments.length, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
