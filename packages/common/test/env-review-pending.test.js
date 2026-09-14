'use strict'

/**
 * The holding area — a review pass that arrived over the wire, and the code
 * that decides whether it ever reaches the review.
 *
 * Nothing here is reachable from outside the machine yet: phase 2 opens the
 * socket. That is deliberate. The consume rule and the refusal are the
 * load-bearing parts, and they are far easier to get right — and to test — with
 * no server involved.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  emptyPending,
  readPending,
  writePending,
  mintPendingCode,
  addPending,
  claimPending,
  reviewPendingPath,
  readNotes,
  PENDING_CODE_LENGTH,
} = require('../src/env/review.js')

const blobOf = (over = {}) => ({ version: 1, spec: 'feat-alpha', accepted: [], unaccepted: [], comments: [], ...over })

// --- minting: unique among pending, and not pretending to be a secret -------

test('a code is six digits, zero-padded', () => {
  const code = mintPendingCode(emptyPending('feat-alpha'), () => 42)
  assert.strictEqual(code, '000042')
  assert.strictEqual(code.length, PENDING_CODE_LENGTH)
})

test('a code is drawn against the pending set, not drawn and hoped for', () => {
  // Two passes already holding the codes the generator offers first. A mint
  // that ignored the set would hand back a duplicate, and a duplicate is how
  // the WRONG pass gets applied — the one failure the code exists to prevent.
  const pending = { version: 1, spec: 'feat-alpha', passes: [{ code: '000001' }, { code: '000002' }] }
  const offers = [1, 1, 2, 3]
  let i = 0
  assert.strictEqual(mintPendingCode(pending, () => offers[i++]), '000003')
})

test('a mint that cannot find a free code fails loudly rather than spinning', () => {
  const passes = [{ code: '000007' }]
  assert.throws(
    () => mintPendingCode({ passes }, () => 7),
    /could not mint a unique pending code/,
  )
})

// --- adding: supersede within a render, coexist across renders --------------

test('a second pass from the same render supersedes the first', () => {
  // Press Approve, change your mind, press Request changes: the code on the
  // screen must be the pass on the screen, and there must be ONE pass waiting.
  let store = emptyPending('feat-alpha')
  const first = addPending(store, { blob: blobOf({ verdict: 'commit' }), at: 'T1', render: 'R1' })
  const second = addPending(first.pending, { blob: blobOf({ verdict: 'changes' }), at: 'T2', render: 'R1' })
  assert.strictEqual(second.pending.passes.length, 1)
  assert.strictEqual(second.pending.passes[0].blob.verdict, 'changes')
  assert.notStrictEqual(second.code, first.code, 'the superseded code is not reusable by accident')
})

test('passes from different renders stand alongside each other', () => {
  // Two sittings, or two people. Neither supersedes the other, and each is
  // claimable by its own code — which is the disambiguation the code is for.
  const a = addPending(emptyPending('feat-alpha'), { blob: blobOf(), at: 'T1', render: 'R1' })
  const b = addPending(a.pending, { blob: blobOf(), at: 'T2', render: 'R2' })
  assert.strictEqual(b.pending.passes.length, 2)
  assert.notStrictEqual(a.code, b.code)
})

// --- claiming: consumes, and never falls back -------------------------------

test('a claim returns exactly the pass it names, and spends it', () => {
  const a = addPending(emptyPending('feat-alpha'), { blob: blobOf({ verdict: 'commit' }), at: 'T1', render: 'R1' })
  const b = addPending(a.pending, { blob: blobOf({ verdict: 'discuss' }), at: 'T2', render: 'R2' })

  const got = claimPending(b.pending, a.code)
  assert.strictEqual(got.pass.blob.verdict, 'commit', 'the one named, not the newest')
  assert.strictEqual(got.count, 1, 'the other is untouched')

  // Consumed: the same code cannot bring it back.
  assert.strictEqual(claimPending(got.pending, a.code).pass, null)
})

// THE REFUSAL. Every one of these is a code that matches nothing, and the only
// acceptable answer is "no pass" — never the single pending one, never the most
// recent. Both would let a pass nobody read out reach the review, which is the
// entire reason the code exists.
test('a wrong code never falls back, not even to the only pass there is', () => {
  const one = addPending(emptyPending('feat-alpha'), { blob: blobOf(), at: 'T1', render: 'R1' })
  for (const wrong of ['000000', '', 'abc', null, undefined, one.code + '0']) {
    const got = claimPending(one.pending, wrong)
    assert.strictEqual(got.pass, null, `"${wrong}" must not resolve`)
    assert.strictEqual(got.pending.passes.length, 1, 'and must not consume anything')
  }
})

test('a claim against an empty store is an ordinary no, not a crash', () => {
  const got = claimPending(emptyPending('feat-alpha'), '123456')
  assert.strictEqual(got.pass, null)
  assert.strictEqual(got.count, 0)
})

// --- the sidecar on disk ----------------------------------------------------

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-pending-')))
}

test('the store round-trips, and an absent one is ordinary', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')
    // Absent is the ordinary state — most reviews never write one.
    const before = readPending(out, 'feat-alpha')
    assert.strictEqual(before.present, false)
    assert.strictEqual(before.corrupt, false)
    assert.deepStrictEqual(before.pending.passes, [])

    const added = addPending(before.pending, { blob: blobOf(), at: 'T1', render: 'R1' })
    writePending(out, added.pending)
    const after = readPending(out, 'feat-alpha')
    assert.strictEqual(after.present, true)
    assert.strictEqual(after.pending.passes[0].code, added.code)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unreadable store is corrupt, which is not the same as empty', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(reviewPendingPath(out), '{ not json')
    const got = readPending(out, 'feat-alpha')
    assert.strictEqual(got.corrupt, true, 'a file we cannot parse is the third state')
    assert.strictEqual(got.present, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the claim, through the real CLI ----------------------------------------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-claim-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  // `reader: local` so these tests never stand a real server up when the suite
  // runs from a bridged or ssh session.
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')
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
const reviewJson = async (dir, ...extra) => JSON.parse(await review(dir, '--json', ...extra))
const outPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')

// Put a pass in the holding area the way phase 2's endpoint will.
function hold(dir, blob, { render = 'R1', at = '2020-01-01T00:00:00.000Z' } = {}) {
  const out = outPath(dir)
  const { pending } = readPending(out, 'feat-alpha')
  const added = addPending(pending, { blob, at, render })
  writePending(out, added.pending)
  return added.code
}

test('a claimed pass merges exactly as a pasted one does', async () => {
  const { dir } = scaffold()
  try {
    await review(dir) // render once, so the page and its paths exist
    const code = hold(dir, blobOf({ verdict: 'commit', accepted: [{ path: 'app.js', hash: 'h1' }] }))

    const json = await reviewJson(dir, '--claim', code)
    assert.strictEqual(json.claimed.code, code)
    assert.strictEqual(json.claimed.accepted, 1)
    // A CLAIM IS A DELIVERY MECHANISM. The verdict is read exactly as it would
    // be from a paste — nothing downstream may behave differently by how the
    // pass arrived.
    assert.strictEqual(json.verdict.effective, 'commit')
    assert.strictEqual(json.verdict.honoured, true)

    const notes = readNotes(outPath(dir), 'feat-alpha').notes
    assert.deepStrictEqual(notes.files['app.js'].acceptedHash, 'h1', 'it reached the real sidecar')
  } finally {
    cleanup(dir)
  }
})

test('a claimed code is spent — the same claim twice is a no', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    const code = hold(dir, blobOf())
    await review(dir, '--claim', code)
    const again = await review(dir, '--claim', code)
    assert.match(again, /no pending pass with that code/)
  } finally {
    cleanup(dir)
  }
})

// THE REFUSAL, end to end. It must not fall back, and it must not LIST — naming
// the pending codes would hand a guesser the answer it was refusing to give.
test('a wrong code writes nothing and names nothing', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    const code = hold(dir, blobOf({ accepted: [{ path: 'app.js', hash: 'h1' }] }))

    const said = await review(dir, '--claim', '000000')
    assert.match(said, /no pending pass with that code/)
    assert.match(said, /1 waiting/, 'the count is fair game')
    assert.ok(!said.includes(code), 'the code itself is not')

    const notes = readNotes(outPath(dir), 'feat-alpha').notes
    assert.deepStrictEqual(notes.files, {}, 'nothing was merged')
    assert.strictEqual(readPending(outPath(dir), 'feat-alpha').pending.passes.length, 1, 'nothing consumed')
  } finally {
    cleanup(dir)
  }
})

test('the render lists what is waiting, and refuses over none of it', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    hold(dir, blobOf(), { render: 'R1' })
    hold(dir, blobOf(), { render: 'R2' })
    const said = await review(dir)
    assert.match(said, /pending: 2 waiting/)
    // Information, never a gate: the render succeeded and reported normally.
    assert.match(said, /spec-env review: feat-alpha/)
    const json = await reviewJson(dir)
    assert.strictEqual(json.pending.length, 2)
  } finally {
    cleanup(dir)
  }
})

test('a blob that fails validation is refused on the way out too', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    // It has been through a socket and sat on disk, so it is untrusted input
    // twice over — validated on the way in AND on the way out.
    const code = hold(dir, blobOf({ verdict: 'aprove' }))
    const said = await review(dir, '--claim', code)
    assert.match(said, /verdict "aprove" is not one of/)
    assert.deepStrictEqual(readNotes(outPath(dir), 'feat-alpha').notes.files, {})
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). A spec nobody has sent a pass for
// must render byte-identically to how it did before any of this existed.
test('stays silent: no holding area at all changes no output', async () => {
  const { dir } = scaffold()
  try {
    const said = await review(dir)
    assert.ok(!said.includes('waiting'), 'no pending line')
    assert.ok(!said.includes('claimed'), 'no claim line')
    const json = await reviewJson(dir)
    assert.ok(!('pending' in json), 'and no key in --json either')
    assert.ok(!('claimed' in json))
    assert.ok(!fs.existsSync(reviewPendingPath(outPath(dir))), 'reading writes no store')
  } finally {
    cleanup(dir)
  }
})

// --- describing what is waiting ---------------------------------------------
//
// The render must be able to NAME a waiting pass, not merely count them. That
// is what makes the never-claim-unasked rule a discipline rather than a request:
// an agent that has to open `.pending.json` to find a code will open it, and
// then the code has protected nothing.

const { describePending, pendingAge } = require('../src/env/review.js')

test('a description carries the code, the verdict and when it arrived', () => {
  const a = addPending(emptyPending('feat-alpha'), {
    blob: blobOf({ verdict: 'commit' }), at: '2026-01-01T10:00:00.000Z', render: 'R1',
  })
  const got = describePending(a.pending)
  assert.deepStrictEqual(got, [{ code: a.code, verdict: 'commit', at: '2026-01-01T10:00:00.000Z' }])
})

// THE BLOB IS NOT HERE, deliberately. A decision about a waiting pass needs its
// code, verdict and age; the notes are what a claim is for. Returning them puts
// an unclaimed stranger's text into the reader's context, which is the one thing
// the holding area exists to defer.
test('a description never carries the blob', () => {
  const a = addPending(emptyPending('feat-alpha'), {
    blob: blobOf({ comments: [{ id: 'c1', file: 'a.js', note: 'unclaimed text' }] }),
    at: '2026-01-01T10:00:00.000Z',
    render: 'R1',
  })
  const got = describePending(a.pending)
  assert.deepStrictEqual(Object.keys(got[0]).sort(), ['at', 'code', 'verdict'])
  assert.ok(!JSON.stringify(got).includes('unclaimed text'))
})

test('the order is oldest first, and total rather than usually-stable', () => {
  // Ties break on the code, which is unique among pending — so two renders name
  // them in the same order even when two passes share a timestamp.
  const pending = {
    version: 1,
    spec: 'feat-alpha',
    passes: [
      { code: '000300', at: '2026-01-01T12:00:00.000Z', blob: blobOf() },
      { code: '000100', at: '2026-01-01T10:00:00.000Z', blob: blobOf() },
      { code: '000200', at: '2026-01-01T10:00:00.000Z', blob: blobOf() },
    ],
  }
  const once = describePending(pending).map((p) => p.code)
  const twice = describePending(pending).map((p) => p.code)
  assert.deepStrictEqual(once, ['000100', '000200', '000300'])
  assert.deepStrictEqual(twice, once, 'stable across renders')
})

test('age reads at a glance, and unknown stays unknown', () => {
  const now = '2026-01-01T12:00:00.000Z'
  assert.strictEqual(pendingAge('2026-01-01T11:59:30.000Z', now), 'just now')
  assert.strictEqual(pendingAge('2026-01-01T11:58:00.000Z', now), '2 min ago')
  assert.strictEqual(pendingAge('2026-01-01T09:00:00.000Z', now), '3 hours ago')
  assert.strictEqual(pendingAge('2025-12-29T12:00:00.000Z', now), '3 days ago')
  // AGE IS THE TELL for a stranger's pass, so a missing one must not render as
  // "just now" — that is the reading that would make it look like yours.
  for (const bad of [null, undefined, '', 'not a date']) {
    assert.strictEqual(pendingAge(bad, now), 'unknown age')
  }
  assert.strictEqual(pendingAge('2026-01-01T13:00:00.000Z', now), 'unknown age', 'the future is not an age')
})

test('the render names each waiting pass rather than counting them', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    const code = hold(dir, blobOf({ verdict: 'commit' }))
    const said = await review(dir)
    assert.match(said, /pending: 1 waiting/)
    assert.match(said, new RegExp(`${code} · commit · `), 'the code is on the line')

    const json = await reviewJson(dir)
    assert.strictEqual(json.pending.length, 1)
    assert.strictEqual(json.pending[0].code, code)
    assert.strictEqual(json.pending[0].verdict, 'commit')
    assert.ok(!('blob' in json.pending[0]))
  } finally {
    cleanup(dir)
  }
})

// --- dropping one the operator says is not theirs ---------------------------

test('--drop removes exactly the pass named, and merges nothing', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    const mine = hold(dir, blobOf({ accepted: [{ path: 'app.js', hash: 'h1' }] }), { render: 'R1' })
    const theirs = hold(dir, blobOf({ verdict: 'commit' }), { render: 'R2' })

    const said = await review(dir, '--drop', theirs)
    assert.match(said, new RegExp(`dropped: ${theirs}`))
    assert.match(said, /merged nothing/)

    const left = readPending(outPath(dir), 'feat-alpha').pending.passes
    assert.deepStrictEqual(left.map((p) => p.code), [mine], 'only the named one went')
    assert.deepStrictEqual(readNotes(outPath(dir), 'feat-alpha').notes.files, {}, 'nothing was merged')
  } finally {
    cleanup(dir)
  }
})

// THE SAME SILENCE AS A CLAIM. A drop that listed the codes it could not find
// would hand a guesser exactly what the claim withholds.
test('--drop with a wrong code changes nothing and names nothing', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    const code = hold(dir, blobOf())
    const said = await review(dir, '--drop', '000000')
    assert.match(said, /no pending pass with that code/)
    assert.match(said, /1 waiting/)
    assert.ok(!said.includes(code), 'the code itself is withheld')
    assert.strictEqual(readPending(outPath(dir), 'feat-alpha').pending.passes.length, 1)
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). A spec nobody has sent a pass for
// renders exactly as it did before any of this existed.
test('stays silent: no holding area means no pending line and no keys', async () => {
  const { dir } = scaffold()
  try {
    const said = await review(dir)
    assert.ok(!said.includes('pending:'))
    assert.ok(!said.includes('dropped:'))
    const json = await reviewJson(dir)
    assert.ok(!('pending' in json))
    assert.ok(!('dropped' in json))
  } finally {
    cleanup(dir)
  }
})
