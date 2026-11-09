'use strict'

// The worktree side of a project that may sit in a subfolder of its repo
// (spec feat-subfolder-project, phase 2): git works on the worktree, everything
// project-scoped happens in `<worktree>/<prefix>`. Built on test/helpers/repo.js,
// so `pnpm test:nested` runs it nested; at prefix '' the two paths are one.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, execSync } = require('node:child_process')

const { makeRepo } = require('./helpers/repo.js')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function cli(cwd, ...args) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()
}

// A setup step that records where it ran.
const WHERE = `node -e "require('fs').writeFileSync('where.txt', process.cwd())"`

function scaffold() {
  const repo = makeRepo({
    name: 'skitterspec-wtside-',
    config: {
      baseBranch: 'main',
      docker: { enabled: false },
      setup: [WHERE],
      seedFiles: { mode: 'copy', files: ['local.settings'] },
    },
    files: {
      '.gitignore': '/.spec-env/\n/local.settings\n/where.txt\n',
      'specs/backlog/feat-x/00-overview.md': '# X\n\n> **Stack:** worktree\n',
      'specs/backlog/feat-x/01-first.md': '# Phase 1 — First ⬜\n',
    },
  })
  // Gitignored in the primary checkout, so only a seed can carry it across.
  fs.writeFileSync(path.join(repo.dir, 'local.settings'), 'secret=1\n')
  return repo
}

function real(p) {
  return fs.realpathSync(p)
}

// Run the plan's `git worktree add …` line exactly as printed, through a shell —
// which is what proves a path with a space in it was quoted.
function provision(repo) {
  const plan = cli(repo.dir, 'spec-env', 'up', 'feat-x')
  const add = plan.split('\n').map((l) => l.trim()).find((l) => l.startsWith('git worktree add '))
  assert.ok(add, `the plan prints a worktree add:\n${plan}`)
  execSync(add, { cwd: repo.dir, stdio: 'ignore' })
  return { plan, add }
}

test('up names the project folder inside the worktree, and adds the worktree itself', () => {
  const repo = scaffold()
  try {
    const { plan, add } = provision(repo)
    const { wt, project } = repo.worktreeFor('x')
    assert.match(plan, new RegExp(`^ {2}worktree: {2}${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
    assert.ok(add.includes(wt), 'git adds the worktree root, not the project folder')
    assert.ok(fs.existsSync(path.join(project, 'specs', 'backlog', 'feat-x')), 'and the project is inside it')
  } finally {
    repo.cleanup()
  }
})

test('a worktree path with a space is quoted in the printed command', () => {
  const repo = scaffold()
  try {
    const { add } = provision(repo)
    if (/\s/.test(repo.worktreeFor('x').wt)) assert.match(add, /^git worktree add "/)
    else assert.match(add, /^git worktree add [^"]/, 'stays silent: no quotes where none are needed')
  } finally {
    repo.cleanup()
  }
})

test('bootstrap runs setup and seeds in the project folder of the worktree', () => {
  const repo = scaffold()
  try {
    provision(repo)
    const { project } = repo.worktreeFor('x')
    const out = cli(project, 'spec-env', 'bootstrap', 'feat-x')
    assert.match(out, /ready/, out)
    assert.strictEqual(real(fs.readFileSync(path.join(project, 'where.txt'), 'utf8')), real(project))
    assert.strictEqual(fs.readFileSync(path.join(project, 'local.settings'), 'utf8'), 'secret=1\n')
  } finally {
    repo.cleanup()
  }
})

test('a bare resolve from the worktree project folder names the spec and that folder', () => {
  const repo = scaffold()
  try {
    provision(repo)
    const { project } = repo.worktreeFor('x')
    const out = cli(project, 'spec-env', 'resolve')
    assert.match(out, /^spec: {7}feat-x \(backlog\)$/m)
    const line = /^worktree: {3}(.+)$/m.exec(out)[1]
    assert.strictEqual(real(line), real(project), 'the folder a session stands in')
  } finally {
    repo.cleanup()
  }
})

test('a spec moved on its branch is read from the worktree project folder', () => {
  const repo = scaffold()
  try {
    provision(repo)
    const { project } = repo.worktreeFor('x')
    fs.mkdirSync(path.join(project, 'specs', 'in-progress'), { recursive: true })
    execFileSync('git', ['-C', project, 'mv', 'specs/backlog/feat-x', 'specs/in-progress/feat-x'])
    execFileSync('git', ['-C', project, 'commit', '-qm', 'start'])
    assert.match(cli(repo.dir, 'spec-env', 'resolve', 'feat-x'), /^spec: {7}feat-x \(in-progress\)$/m)
    assert.match(cli(repo.dir, 'status'), /feat-x\s+in-progress · 0 of 1 phases done/)
  } finally {
    repo.cleanup()
  }
})

test('handoff reads the phases from the worktree project folder', () => {
  const repo = scaffold()
  try {
    provision(repo)
    // Handoff publishes the branch first, so it needs somewhere to publish to.
    const origin = `${repo.root}-origin.git`
    execFileSync('git', ['init', '-q', '--bare', origin])
    repo.git('remote', 'add', 'origin', origin)
    execFileSync('git', ['-C', repo.worktreeFor('x').wt, 'push', '-q', '-u', 'origin', 'feat/x'], { stdio: 'ignore' })
    const out = cli(repo.dir, 'spec-env', 'handoff', 'feat-x', '--json')
    fs.rmSync(origin, { recursive: true, force: true })
    assert.strictEqual(JSON.parse(out).progress.total, 1, out)
  } finally {
    repo.cleanup()
  }
})
