'use strict'

/**
 * `spec-env base` — the planner over plain facts, then the real CLI over a real
 * git repo with a bare remote, because the fetch, the date sort and the
 * merge-bases are git's answers and a fake reader would only echo ours back.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { forkMatch, planBaseReport } = require('../src/env/base.js')
const { run } = require('../src/cli.js')

// --- planner ----------------------------------------------------------------

const MATCHES = [
  { name: '2027/Q1', date: '2026-11-05' },
  { name: '2026/Q4', date: '2026-08-01' },
]

test('planBaseReport: matches newest-first, the resolved one marked', () => {
  const { lines, json } = planBaseReport({
    pattern: '20??/Q?',
    remote: 'origin',
    base: '2027/Q1',
    how: 'pattern',
    fetch: { ok: true, reason: null },
    matches: MATCHES,
    forks: [],
  })
  assert.deepStrictEqual(lines, [
    'spec-env base: 2027/Q1 (newest match for 20??/Q?)',
    '  fetched origin',
    '  2027/Q1  2026-11-05  ← base',
    '  2026/Q4  2026-08-01',
  ])
  assert.deepStrictEqual(
    json.matches.map((m) => [m.name, m.base]),
    [
      ['2027/Q1', true],
      ['2026/Q4', false],
    ],
  )
})

test('planBaseReport: a pin says so, and marks itself when it is a match', () => {
  const { lines } = planBaseReport({
    pattern: '20??/Q?',
    remote: 'origin',
    base: '2026/Q4',
    how: 'pin',
    fetch: { ok: true, reason: null },
    matches: MATCHES,
    forks: [{ spec: 'feat-x', forkedFrom: '2027/Q1' }],
  })
  assert.strictEqual(lines[0], 'spec-env base: 2026/Q4 (pinned by baseBranch — 20??/Q? not used)')
  assert.ok(lines.includes('  2026/Q4  2026-08-01  ← base (pin)'))
  // A pin is a chosen base — the matches beside it do not make a spec "behind".
  assert.ok(!lines.some((l) => l.includes('forked from')))
})

test('planBaseReport: specs forked from an older match are named', () => {
  const { lines, json } = planBaseReport({
    pattern: '20??/Q?',
    remote: 'origin',
    base: '2027/Q1',
    how: 'pattern',
    fetch: { ok: true, reason: null },
    matches: MATCHES,
    forks: [
      { spec: 'feat-new', forkedFrom: '2027/Q1' },
      { spec: 'feat-old', forkedFrom: '2026/Q4' },
      { spec: 'feat-unknown', forkedFrom: null },
    ],
  })
  assert.deepStrictEqual(lines.slice(-2), ['  forked from an older match:', '    feat-old · forked from 2026/Q4'])
  assert.deepStrictEqual(json.stale, [{ spec: 'feat-old', forkedFrom: '2026/Q4' }])
})

test('planBaseReport: no pattern prints the base and how, and nothing else', () => {
  for (const [how, label] of [
    ['pin', 'pinned by baseBranch'],
    ['origin-head', 'origin/HEAD'],
    ['fallback', 'nothing detected — default'],
  ]) {
    const { lines } = planBaseReport({ pattern: '', remote: 'origin', base: 'main', how, fetch: null })
    assert.deepStrictEqual(lines, [`spec-env base: main (${label})`])
  }
})

test('planBaseReport: a failed fetch is said, and the listing carries on', () => {
  const { lines } = planBaseReport({
    pattern: '20??/Q?',
    remote: 'origin',
    base: '2026/Q4',
    how: 'pattern',
    fetch: { ok: false, reason: 'fatal: could not read from remote repository.' },
    matches: [MATCHES[1]],
    forks: [],
  })
  assert.strictEqual(
    lines[1],
    '  fetch from origin failed (fatal: could not read from remote repository.) — listing the refs already here',
  )
  assert.strictEqual(lines[2], '  2026/Q4  2026-08-01  ← base')
})

test('planBaseReport: no match names the pattern and the remote', () => {
  const { lines, json } = planBaseReport({
    pattern: '20??/Q?',
    remote: 'origin',
    base: null,
    how: 'pattern',
    fetch: { ok: true, reason: null },
    matches: [],
  })
  assert.deepStrictEqual(lines, ['spec-env base: none — no branch on origin matches 20??/Q?', '  fetched origin'])
  assert.strictEqual(json.base, null)
})

test('planBaseReport: a gap pin names the fallback, the pattern and how it clears', () => {
  const { lines, json } = planBaseReport({
    pattern: '20??/Q?',
    remote: 'origin',
    base: 'master',
    how: 'gap-pin',
    fetch: { ok: true, reason: null },
    matches: [],
    forks: [],
    pin: { base: 'master', pattern: '20??/Q?', pinnedAt: '2020-01-01T00:00:00.000Z' },
  })
  assert.deepStrictEqual(lines, [
    'spec-env base: master — no 20??/Q? branch on origin (pinned for the gap)',
    '  fetched origin',
    '  pinned since 2020-01-01 · clears itself when a 20??/Q? branch appears · --unpin removes it now',
  ])
  assert.strictEqual(json.pin.base, 'master')
})

test('planBaseReport: no match with an offer prints the offer under the refusal', () => {
  const offer = { kind: 'satisfy', label: 'Use master as the base for now', command: 'skitterspec spec-env base --use-fallback' }
  const { lines, json } = planBaseReport({ pattern: '20??/Q?', remote: 'origin', base: null, how: 'pattern', fetch: null, offer })
  assert.deepStrictEqual(lines, [
    'spec-env base: none — no branch on origin matches 20??/Q?',
    '  offer: Use master as the base for now — skitterspec spec-env base --use-fallback',
  ])
  assert.deepStrictEqual(json.offer, offer)
})

test('planBaseReport: a match carries no pin and no offer (stays silent)', () => {
  const { lines, json } = planBaseReport({ pattern: '20??/Q?', remote: 'origin', base: '2027/Q1', how: 'pattern', matches: MATCHES })
  assert.ok(!lines.some((l) => /pin|offer/.test(l)))
  assert.strictEqual(json.pin, null)
  assert.strictEqual(json.offer, null)
})

test('forkMatch: the match with the newest merge-base wins', () => {
  const mb = { '2027/Q1': 'root', '2026/Q4': 'q4tip' }
  const ancestry = new Set(['root>q4tip'])
  const fork = forkMatch(['2027/Q1', '2026/Q4'], (n) => mb[n], (a, b) => a === b || ancestry.has(`${a}>${b}`))
  assert.strictEqual(fork, '2026/Q4')
})

test('forkMatch: a tie goes to the newer match (stays silent)', () => {
  const fork = forkMatch(['2027/Q1', '2026/Q4'], () => 'same', () => true)
  assert.strictEqual(fork, '2027/Q1')
})

test('forkMatch: no merge-base with any match → null', () => {
  assert.strictEqual(forkMatch(['2027/Q1'], () => null, () => false), null)
})

// --- CLI over a real repo ----------------------------------------------------

function git(cwd, args, env = {}) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, ...env },
  })
    .toString()
    .trim()
}

function commit(cwd, file, msg, date) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', msg], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date })
}

// main, plus two rcs on a bare remote: 2026/Q4 (older, with a commit of its
// own) and 2027/Q1 (newer, cut from main without it). One spec worktree forked
// from 2026/Q4. Dates are fixed relative values, never today.
function scaffold({ config = {}, remoteUrl = null, originHead = false } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-base-')))
  const remote = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-base-remote-')))
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })

  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranchPattern: '20??/Q?', docker: { enabled: false }, ...config }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-thing')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  commit(dir, 'seed.txt', 'init', '2020-01-01T00:00:00Z')
  git(dir, ['branch', '-M', 'main'])
  git(dir, ['remote', 'add', 'origin', remote])

  git(dir, ['switch', '-q', '-c', '2026/Q4'])
  commit(dir, 'q4.txt', 'q4 work', '2020-02-01T00:00:00Z')
  git(dir, ['switch', '-q', 'main'])
  git(dir, ['switch', '-q', '-c', '2027/Q1'])
  commit(dir, 'q1.txt', 'q1 cut', '2020-03-01T00:00:00Z')
  git(dir, ['switch', '-q', 'main'])
  git(dir, ['push', '-q', 'origin', 'main', '2026/Q4', '2027/Q1'])
  git(dir, ['fetch', '-q', 'origin'])

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'thing')
  git(dir, ['worktree', 'add', '-q', '-b', 'feat/thing', worktree, 'origin/2026/Q4'])
  commit(worktree, 'work.txt', 'phase 1', '2020-02-15T00:00:00Z')

  if (originHead) git(dir, ['remote', 'set-head', 'origin', 'main'])
  if (remoteUrl) git(dir, ['remote', 'set-url', 'origin', remoteUrl])
  return { dir, remote }
}

function cleanup({ dir, remote }) {
  try {
    git(dir, ['worktree', 'prune'])
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
  fs.rmSync(remote, { recursive: true, force: true })
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

test('spec-env base: lists by date, marks the base, names the spec on the older rc', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'base', '--dir', fx.dir])
    const lines = out.trimEnd().split('\n')
    assert.strictEqual(lines[0], 'spec-env base: 2027/Q1 (newest match for 20??/Q?)')
    assert.strictEqual(lines[1], '  fetched origin')
    assert.match(lines[2], /^ {2}2027\/Q1 {2}2020-03-01 {2}← base$/)
    assert.match(lines[3], /^ {2}2026\/Q4 {2}2020-02-01$/)
    assert.deepStrictEqual(lines.slice(4), ['  forked from an older match:', '    feat-thing · forked from 2026/Q4'])
  } finally {
    cleanup(fx)
  }
})

test('spec-env base --json: the same answer as data', async () => {
  const fx = scaffold()
  try {
    const json = JSON.parse(await runQuiet(['spec-env', 'base', '--json', '--dir', fx.dir]))
    assert.strictEqual(json.base, '2027/Q1')
    assert.strictEqual(json.how, 'pattern')
    assert.deepStrictEqual(json.fetch, { ok: true, reason: null })
    assert.deepStrictEqual(json.stale, [{ spec: 'feat-thing', forkedFrom: '2026/Q4' }])
  } finally {
    cleanup(fx)
  }
})

test('spec-env base: a pin overrides the pattern and reports no stale specs', async () => {
  const fx = scaffold({ config: { baseBranch: '2026/Q4' } })
  try {
    const out = await runQuiet(['spec-env', 'base', '--dir', fx.dir])
    assert.match(out, /^spec-env base: 2026\/Q4 \(pinned by baseBranch — 20\?\?\/Q\? not used\)/)
    assert.match(out, /2026\/Q4 {2}2020-02-01 {2}← base \(pin\)/)
    assert.doesNotMatch(out, /forked from/)
  } finally {
    cleanup(fx)
  }
})

test('spec-env base: a failed fetch is reported and the listing comes from refs already here', async () => {
  const fx = scaffold({ remoteUrl: path.join(os.tmpdir(), 'skitterspec-base-no-such-remote') })
  try {
    const out = await runQuiet(['spec-env', 'base', '--dir', fx.dir])
    const lines = out.trimEnd().split('\n')
    assert.strictEqual(lines[0], 'spec-env base: 2027/Q1 (newest match for 20??/Q?)')
    assert.match(lines[1], /^ {2}fetch from origin failed .* — listing the refs already here$/)
    assert.match(lines[2], /2027\/Q1 .*← base$/)
  } finally {
    cleanup(fx)
  }
})

test('spec-env base: no pattern prints the base and how, nothing else', async () => {
  const fx = scaffold({ config: { baseBranchPattern: '', baseBranch: 'main' } })
  try {
    const out = await runQuiet(['spec-env', 'base', '--dir', fx.dir])
    assert.strictEqual(out, 'spec-env base: main (pinned by baseBranch)\n')
  } finally {
    cleanup(fx)
  }
})

// --- the gap ------------------------------------------------------------------

// `2028/Q?` matches neither rc the scaffold pushes, which is the gap: the last
// release branch merged and the next not yet cut.
const GAP = { baseBranchPattern: '2028/Q?' }
const pinFile = (dir) => path.join(dir, '.spec-env', 'base-pin.json')

test('spec-env base: in the gap, offers the remote default branch', async () => {
  const fx = scaffold({ config: GAP, originHead: true })
  try {
    const out = await runQuiet(['spec-env', 'base', '--dir', fx.dir])
    assert.match(out, /^spec-env base: none — no branch on origin matches 2028\/Q\?/)
    assert.match(out, /offer: Use main as the base for now — skitterspec spec-env base --use-fallback/)
  } finally {
    cleanup(fx)
  }
})

test('spec-env base --use-fallback: pins, and bare base then reports the pin', async () => {
  const fx = scaffold({ config: GAP, originHead: true })
  try {
    const out = await runQuiet(['spec-env', 'base', '--use-fallback', '--dir', fx.dir])
    assert.match(out, /pinned main for the gap — no 2028\/Q\? branch on origin/)
    assert.strictEqual(JSON.parse(fs.readFileSync(pinFile(fx.dir), 'utf8')).base, 'main')
    const json = JSON.parse(await runQuiet(['spec-env', 'base', '--json', '--dir', fx.dir]))
    assert.strictEqual(json.base, 'main')
    assert.strictEqual(json.how, 'gap-pin')
  } finally {
    cleanup(fx)
  }
})

test('spec-env base: a match retires the pin and deletes the file', async () => {
  const fx = scaffold({ config: GAP, originHead: true })
  try {
    await runQuiet(['spec-env', 'base', '--use-fallback', '--dir', fx.dir])
    git(fx.dir, ['switch', '-q', '-c', '2028/Q1'])
    commit(fx.dir, 'q28.txt', '2028 cut', '2020-04-01T00:00:00Z')
    git(fx.dir, ['switch', '-q', 'main'])
    git(fx.dir, ['push', '-q', 'origin', '2028/Q1'])
    const out = await runQuiet(['spec-env', 'base', '--dir', fx.dir])
    assert.match(out, /^spec-env base: 2028\/Q1 \(newest match for 2028\/Q\?\)/)
    assert.match(out, /gap pin cleared — 2028\/Q1 matches 2028\/Q\?/)
    assert.ok(!fs.existsSync(pinFile(fx.dir)))
  } finally {
    cleanup(fx)
  }
})

test('spec-env base --use-fallback: refuses with no fallback, on a match, and on a failed fetch', async () => {
  const noHead = scaffold({ config: GAP })
  const matching = scaffold()
  const offline = scaffold({ config: GAP, originHead: true, remoteUrl: path.join(os.tmpdir(), 'skitterspec-base-no-such-remote') })
  try {
    for (const [fx, why] of [
      [noHead, /no fallback resolves/],
      [matching, /2027\/Q1 matches 20\?\?\/Q\? — no gap to pin/],
      [offline, /cannot tell whether a 2028\/Q\? branch exists, so nothing was pinned/],
    ]) {
      process.exitCode = 0
      const out = await runQuiet(['spec-env', 'base', '--use-fallback', '--dir', fx.dir])
      assert.match(out, why)
      assert.strictEqual(process.exitCode, 1)
      assert.ok(!fs.existsSync(pinFile(fx.dir)))
    }
  } finally {
    process.exitCode = 0
    for (const fx of [noHead, matching, offline]) cleanup(fx)
  }
})

test('spec-env base --unpin: removes the pin, and says so when there is none', async () => {
  const fx = scaffold({ config: GAP, originHead: true })
  try {
    await runQuiet(['spec-env', 'base', '--use-fallback', '--dir', fx.dir])
    assert.match(await runQuiet(['spec-env', 'base', '--unpin', '--dir', fx.dir]), /gap pin removed/)
    assert.match(await runQuiet(['spec-env', 'base', '--unpin', '--dir', fx.dir]), /no gap pin to remove/)
  } finally {
    cleanup(fx)
  }
})
