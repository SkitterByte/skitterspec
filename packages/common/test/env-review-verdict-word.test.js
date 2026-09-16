'use strict'

/**
 * `--verdict <word>` — a verdict with nothing else attached.
 *
 * A `file://` page has no server to POST to and no store to write to, so its
 * buttons cannot deliver anything; today they hand over a JSON blob to paste.
 * Where the pass carries nothing but a verdict, that blob is a wall of text
 * standing in for one word — so the word can travel on its own, as a command
 * the reader runs in the terminal they are already sitting beside.
 *
 * IT IS THE SAME MERGE, not a second kind of review. The word joins the path a
 * claimed pass and a pasted blob both go through, so `judgeVerdict` still
 * refuses a commit over open comments, the outcome log still records it, and
 * the gate still clears — none of which can be skipped by arriving this way.
 *
 * WHAT IT DELIBERATELY CANNOT CARRY: accepts and comments. A command line is
 * not a place to put someone's notes, and quietly dropping them would be worse
 * than asking for the blob. The page decides which shape to offer; this only
 * ever means "the verdict, and nothing was marked".
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { VERDICTS } = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-vword-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }, null, 2),
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
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nthree\n')
  return { dir, wt }
}

function cleanup(dir) {
  try { git(dir, 'worktree', 'prune') } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => { out += c; return true }
  try { await run(argv) } finally { process.stdout.write = orig }
  return out
}

const review = (dir, ...extra) => runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])
const reviewJson = async (dir, ...extra) => JSON.parse(await review(dir, '--json', ...extra))
const notesOf = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json'), 'utf8'))

function blobFile(dir, blob) {
  const p = path.join(dir, 'blob.json')
  fs.writeFileSync(p, JSON.stringify({ version: 1, spec: 'feat-alpha', ...blob }))
  return p
}

test('a verdict word is honoured exactly as a pass carrying only that verdict', async () => {
  const { dir } = scaffold()
  try {
    const out = await reviewJson(dir, '--verdict', 'commit')
    assert.strictEqual(out.verdict.sent, 'commit')
    assert.strictEqual(out.verdict.honoured, true)
    // The outcome log records it, with no code — it never went through the
    // holding area, and inventing one would put a pass in the record that
    // never existed.
    const last = notesOf(dir).decisions.slice(-1)[0]
    assert.strictEqual(last.verdict, 'commit')
    assert.strictEqual(last.code, null)
  } finally {
    cleanup(dir)
  }
})

test('every verdict the page can offer is a word this accepts', async () => {
  for (const v of VERDICTS) {
    const { dir } = scaffold()
    try {
      const out = await reviewJson(dir, '--verdict', v)
      assert.strictEqual(out.verdict.sent, v, `${v} should be accepted`)
    } finally {
      cleanup(dir)
    }
  }
})

test('an unknown word is refused by name, and writes nothing', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(dir, '--verdict', 'aprove')
    assert.match(out, /is not one of commit, commit-continue, commit-start, continue, changes, discuss/)
    assert.strictEqual(
      fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')),
      false,
      'a refused word leaves no sidecar behind',
    )
  } finally {
    cleanup(dir)
  }
})

// The word is not a way round the one refusal on the page. A commit over open
// comments is refused whether it arrives as a blob, a claimed pass, or a word.
test('a commit word is refused over an open comment, like any other commit', async () => {
  const { dir } = scaffold()
  try {
    await review(dir, '--notes', blobFile(dir, { comments: [{ id: 'c1', file: 'app.js', note: 'why?' }] }))
    const out = await reviewJson(dir, '--verdict', 'commit')
    assert.strictEqual(out.verdict.honoured, false)
    assert.match(out.verdict.reason, /unresolved/)
  } finally {
    cleanup(dir)
  }
})

test('a committing word clears the gate a phase armed', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(['spec-env', 'review', 'arm', 'feat-alpha', '--dir', dir])
    const armed = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(armed.state, 'armed')
    await review(dir, '--verdict', 'commit')
    const after = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(after.state, 'clear')
  } finally {
    cleanup(dir)
  }
})

// TWO VERDICTS IN ONE INVOCATION is the one thing this must not resolve by
// picking. They can disagree, and acting on either without saying so would
// commit work on the strength of a word nobody meant as the answer.
test('a word alongside a claim is refused rather than reconciled', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(dir, '--verdict', 'commit', '--claim', '418207')
    assert.match(out, /one verdict/i)
    assert.doesNotMatch(out, /no pending pass/, 'it refuses before it goes looking')
  } finally {
    cleanup(dir)
  }
})

test('a word alongside a pasted blob is refused the same way', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(dir, '--verdict', 'commit', '--notes', blobFile(dir, { verdict: 'changes' }))
    assert.match(out, /one verdict/i)
  } finally {
    cleanup(dir)
  }
})

// A word carries no marks, and must not appear to have cleared any.
test('a word merges nothing — no accepts, no comments, no resolutions', async () => {
  const { dir } = scaffold()
  try {
    const out = await reviewJson(dir, '--verdict', 'discuss')
    assert.strictEqual(out.merged, null, 'nothing was merged, so nothing is reported as merged')
    const notes = notesOf(dir)
    assert.deepStrictEqual(notes.comments, [])
    assert.deepStrictEqual(notes.files, {})
  } finally {
    cleanup(dir)
  }
})

// Stays silent: the flag absent changes nothing at all.
test('stays silent: a render with no word behaves exactly as before', async () => {
  const { dir } = scaffold()
  try {
    const out = await reviewJson(dir)
    assert.ok(!('verdict' in out), 'no verdict key gained by the flag existing')
    assert.strictEqual(fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')), false)
  } finally {
    cleanup(dir)
  }
})

// The parse in `/spec-reviewed` tells four argument shapes apart with no flag,
// so a verdict word must not be mistakable for a spec name. It cannot be: every
// spec folder carries a lifecycle prefix, and no verdict starts with one.
test('no verdict word can be mistaken for a spec folder name', () => {
  for (const v of VERDICTS) {
    for (const prefix of ['feat-', 'bug-', 'hotfix-']) {
      assert.ok(!v.startsWith(prefix), `${v} must not look like a ${prefix} spec`)
    }
    assert.doesNotMatch(v, /^\d{6}$/, `${v} must not look like a pass code`)
  }
})
