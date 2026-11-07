'use strict'

/**
 * `spec-env up` on a spec whose branch someone else already published — the
 * new owner of a handed-over spec. Driven through the real CLI over a real repo
 * with a bare remote, and the planned commands are RUN, because the claim worth
 * testing is that the worktree ends up on the published work.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function commit(cwd, file, msg) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '-m', msg])
}

function scaffold({ remote: withRemote = true, published = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resume-')))
  git(dir, ['init', '-q', '-b', 'main'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ docker: { enabled: false }, guards: { mainIsLandingZone: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.mkdirSync(path.join(dir, 'specs', 'backlog', 'feat-thing'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', 'backlog', 'feat-thing', '00-overview.md'), '# Thing\n\n> **Stack:** worktree\n')
  commit(dir, 'seed.txt', 'init')
  let remote = null
  let sha = null
  if (withRemote) {
    remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resume-remote-')))
    execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })
    git(dir, ['remote', 'add', 'origin', remote])
    git(dir, ['push', '-q', 'origin', 'main'])
    if (published) {
      // The previous owner's clone: started the spec, did a phase, pushed it.
      const prev = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resume-prev-')))
      execFileSync('git', ['clone', '-q', remote, prev], { stdio: 'ignore' })
      git(prev, ['switch', '-q', '-c', 'feat/thing'])
      commit(prev, 'work.txt', 'phase 1')
      git(prev, ['push', '-q', 'origin', 'feat/thing'])
      sha = git(prev, ['rev-parse', 'HEAD'])
      fs.rmSync(prev, { recursive: true, force: true })
    }
  }
  return { dir, remote, sha }
}

function cleanup({ dir, remote }) {
  try {
    git(dir, ['worktree', 'prune'])
  } catch {}
  for (const p of [dir, path.resolve(dir, `../${path.basename(dir)}-wt`), remote].filter(Boolean)) {
    fs.rmSync(p, { recursive: true, force: true })
  }
}

async function up(dir) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(['spec-env', 'up', 'feat-thing', '--dir', dir])
  } finally {
    process.stdout.write = orig
  }
  return out
}

function provisionCommands(out) {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l.trim() === 'to provision, run:')
  assert.ok(start !== -1, out)
  const cmds = []
  for (const l of lines.slice(start + 1)) {
    if (!l.trim()) break
    cmds.push(l.trim())
  }
  return cmds
}

test('a published branch is resumed, not forked — and the worktree lands on the work', async () => {
  const fx = scaffold()
  try {
    const out = await up(fx.dir)
    assert.match(out, new RegExp(`resume: {4}origin/feat/thing @ ${fx.sha.slice(0, 12)}`))
    const cmds = provisionCommands(out)
    assert.strictEqual(cmds[0], 'git fetch origin feat/thing')
    assert.match(cmds[1], /^git worktree add \S+ -b feat\/thing --track origin\/feat\/thing$/)
    for (const c of cmds) execFileSync('sh', ['-c', c], { cwd: fx.dir, stdio: 'ignore' })
    const wt = cmds[1].split(' ')[3]
    assert.strictEqual(git(wt, ['rev-parse', 'HEAD']), fx.sha)
    assert.ok(fs.existsSync(path.join(wt, 'work.txt')), "the previous owner's phase is there")
    assert.strictEqual(git(wt, ['rev-parse', '--abbrev-ref', '@{upstream}']), 'origin/feat/thing')
  } finally {
    cleanup(fx)
  }
})

test('stays silent: an unpublished spec forks exactly as before', async () => {
  const fx = scaffold({ published: false })
  try {
    const out = await up(fx.dir)
    assert.doesNotMatch(out, /resume:/)
    assert.match(provisionCommands(out).join('\n'), /git worktree add \S+ -b feat\/thing$/m)
  } finally {
    cleanup(fx)
  }
})

test('stays silent: a repo with no remote is not asked', async () => {
  const fx = scaffold({ remote: false })
  try {
    const out = await up(fx.dir)
    assert.doesNotMatch(out, /resume:/)
  } finally {
    cleanup(fx)
  }
})
