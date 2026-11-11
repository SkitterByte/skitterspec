'use strict'

// Re-verify a wait met by rebase (spec feat-epics, Decision 9 / phase 7). The
// field case: #154 phase 2 was built before #159 phase 1 landed, then rebased
// over it and landed in the right order — with nothing ever having run its
// tests with the dependency underneath.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { waitsMetByRebase, indexSpecTree } = require('../src/env/epic.js')
const { run } = require('../src/cli.js')

const phase = (done, waits = null) =>
  `# Phase — ${done ? '✅' : '⬜'}\n\n> **Status:** ${done ? 'Done' : 'Not started'}\n${waits ? `> **Waits on:** ${waits}\n` : ''}`

const tree = (files) => ({
  index: indexSpecTree(Object.keys(files).join('\n')),
  readFile: (p) => (p in files ? files[p] : null),
})

const SAFETY_P1_PENDING = {
  'specs/in-progress/feat-safety/00-overview.md': '# S\n',
  'specs/in-progress/feat-safety/01-guard.md': phase(false),
}
const SAFETY_P1_LANDED = { ...SAFETY_P1_PENDING, 'specs/in-progress/feat-safety/01-guard.md': phase(true) }

test('the field case: a built phase whose wait the rebase brings in is listed', () => {
  const r = waitsMetByRebase({
    overview: '# One-off\n',
    phases: [
      { n: 1, text: phase(true) },
      { n: 2, text: phase(true, 'feat-safety phase 1') },
    ],
    before: tree(SAFETY_P1_PENDING),
    after: tree(SAFETY_P1_LANDED),
  })
  assert.deepStrictEqual(r.met.map((m) => [m.phase, m.wait.raw]), [[2, 'feat-safety phase 1']])
  assert.deepStrictEqual(r.cannotTell, [])
})

// STAYS-SILENT: the dependency was already underneath when the phase was built.
test('a wait already met at the fork point lists nothing', () => {
  const r = waitsMetByRebase({
    overview: '# One-off\n',
    phases: [{ n: 2, text: phase(true, 'feat-safety phase 1') }],
    before: tree(SAFETY_P1_LANDED),
    after: tree(SAFETY_P1_LANDED),
  })
  assert.deepStrictEqual(r, { met: [], cannotTell: [] })
})

test('a phase not yet built is not listed — it will be built on top anyway', () => {
  const r = waitsMetByRebase({
    overview: '# One-off\n',
    phases: [{ n: 2, text: phase(false, 'feat-safety phase 1') }],
    before: tree(SAFETY_P1_PENDING),
    after: tree(SAFETY_P1_LANDED),
  })
  assert.deepStrictEqual(r, { met: [], cannotTell: [] })
})

test('a start wait met by the rebase is listed once the spec has built anything', () => {
  const overview = '# Gen\n\n> **Waits on:** feat-safety phase 1\n'
  const before = tree(SAFETY_P1_PENDING)
  const after = tree(SAFETY_P1_LANDED)
  assert.deepStrictEqual(
    waitsMetByRebase({ overview, phases: [{ n: 1, text: phase(true) }], before, after }).met.map((m) => m.phase),
    [null],
  )
  assert.deepStrictEqual(waitsMetByRebase({ overview, phases: [{ n: 1, text: phase(false) }], before, after }).met, [])
})

test('an unreadable fork point is cannot-tell, never a claimed re-run', () => {
  const r = waitsMetByRebase({
    overview: '# One-off\n',
    phases: [{ n: 2, text: phase(true, 'feat-safety phase 1') }],
    before: { index: new Map(), readFile: () => null },
    after: tree(SAFETY_P1_LANDED),
  })
  assert.deepStrictEqual(r.met, [])
  assert.match(r.cannotTell[0].wait.why, /feat-safety is not on the base branch at the fork point/)
})

// --- end to end: `spec-env integrate` prints it before the fast-forward ---------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
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

function scaffold({ landSafetyAfterFork }) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reverify-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@example.com')
  git(dir, 'config', 'user.name', 'T')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }))
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const put = (root, file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  for (const [file, text] of Object.entries(SAFETY_P1_PENDING)) put(dir, file, text)
  put(dir, 'specs/in-progress/feat-oneoff/00-overview.md', '# One-off\n\n> **Stack:** worktree\n')
  put(dir, 'specs/in-progress/feat-oneoff/02-strength.md', phase(false, 'feat-safety phase 1'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  // The member builds phase 2 on its branch, before the safety phase lands.
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'oneoff')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/oneoff', worktree)
  put(worktree, 'specs/in-progress/feat-oneoff/02-strength.md', phase(true, 'feat-safety phase 1'))
  git(worktree, 'commit', '-q', '-am', 'phase 2')

  if (landSafetyAfterFork) {
    put(dir, 'specs/in-progress/feat-safety/01-guard.md', phase(true))
    git(dir, 'commit', '-q', '-am', 'safety phase 1')
  }
  return { dir, worktree }
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('integrate names the phase to re-verify, before the run-these commands', async () => {
  const { dir } = scaffold({ landSafetyAfterFork: true })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-oneoff', '--dir', dir])
    assert.match(out, /re-verify: this rebase brings in what built phases waited on/)
    assert.match(out, /phase 2 waited on feat-safety phase 1 — feat-safety phase 1 is done/)
    assert.ok(out.indexOf('re-verify:') < out.indexOf('run these'), 'said before the commands')
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT: nothing arrives by this rebase, so the plan reads as before.
test('integrate says nothing about re-verifying when the rebase brings nothing in', async () => {
  const { dir } = scaffold({ landSafetyAfterFork: false })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-oneoff', '--dir', dir])
    assert.doesNotMatch(out, /re-verify/)
    assert.match(out, /run these/)
  } finally {
    cleanup(dir)
  }
})

test('the landing skills run the tests between the rebase and the fast-forward', () => {
  for (const skill of ['spec-complete', 'spec-to-main']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', skill, 'SKILL.md'), 'utf8')
    assert.match(text, /When the plan carries `re-verify:` lines/, skill)
    assert.match(text, /\*\*stop before the fast-forward\*\*/, skill)
  }
})
