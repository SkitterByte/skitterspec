'use strict'

/**
 * `spec-env integrate` refuses to land another spec's commits under this
 * spec's name (bug-up-forks-from-head, phase 2).
 *
 * Before phase 1, a spec created while another was live forked from that
 * spec's branch, and the fast-forward carried both onto the base. A branch
 * made that way, by an older engine or by hand, still exists, so the land
 * checks where the branch was CREATED: commits between the base and that
 * point were there before the branch, so they are not its own.
 *
 * Real repos throughout, because the signal is git's reflog and reachability.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function commit(cwd, file, msg) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', msg])
}

function writeSpec(root, bucket, folder, frontmatter = '') {
  const d = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, '00-overview.md'), `${frontmatter}# X\n\n> **Stack:** worktree\n`)
}

const LINKED = '---\ngithub_identifier: "#7"\n---\n\n'

function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-foreign-')))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ docker: { enabled: false }, guards: { baseIsLandingZone: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  writeSpec(dir, 'in-progress', 'feat-live')
  writeSpec(dir, 'in-progress', 'feat-next', LINKED)
  commit(dir, 'seed.txt', 'init')
  git(dir, ['branch', '-M', 'main'])
  const wt = (slug) => path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  return { dir, wt }
}

function cleanup({ dir }) {
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

// Spec A's branch, two commits ahead, in its own worktree.
function liveSpec(fx) {
  git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/live', fx.wt('live'), 'main'])
  commit(fx.wt('live'), 'a1.txt', 'live work 1')
  commit(fx.wt('live'), 'a2.txt', 'live work 2')
}

function integrate(fx) {
  return runQuiet(['spec-env', 'integrate', 'feat-next', '--dir', fx.dir])
}

test('integrate: a branch created on another spec\'s commits refuses, naming them and the owner', async () => {
  const fx = scaffold()
  try {
    liveSpec(fx)
    // What the old `up` did with feat/live checked out: fork from its tip.
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), 'feat/live'])
    commit(fx.wt('next'), 'b1.txt', 'next fix')
    const mainBefore = git(fx.dir, ['rev-parse', 'main'])

    const out = await integrate(fx)
    assert.match(out, /spec-env integrate: blocked — feat\/next was created on [0-9a-f]{12}, which is not on main/)
    assert.match(out, /2 commit\(s\) that are feat-live's: [0-9a-f]+ live work 1; [0-9a-f]+ live work 2/)
    assert.match(out, /land feat-live first/)
    assert.match(out, /rebase --onto main [0-9a-f]{40}/)
    assert.doesNotMatch(out, /next fix/, 'the spec\'s own commit is not named')
    assert.doesNotMatch(out, /run these/)
    assert.strictEqual(git(fx.dir, ['rev-parse', 'main']), mainBefore, 'nothing moved')
  } finally {
    cleanup(fx)
  }
})

test('integrate: the offered rebase --onto leaves a branch that lands cleanly', async () => {
  const fx = scaffold()
  try {
    liveSpec(fx)
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), 'feat/live'])
    commit(fx.wt('next'), 'b1.txt', 'next fix')
    const from = /rebase --onto main ([0-9a-f]{40})/.exec(await integrate(fx))[1]
    git(fx.wt('next'), ['rebase', '-q', '--onto', 'main', from])
    const out = await integrate(fx)
    assert.match(out, /run these/)
    assert.doesNotMatch(out, /blocked|warning:/)
  } finally {
    cleanup(fx)
  }
})

test('stays silent: a branch forked from the base, with a spec live elsewhere', async () => {
  const fx = scaffold()
  try {
    liveSpec(fx)
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), 'main'])
    commit(fx.wt('next'), 'b1.txt', 'next fix')
    const out = await integrate(fx)
    assert.match(out, /run these/)
    assert.doesNotMatch(out, /blocked|warning:/)
  } finally {
    cleanup(fx)
  }
})

test('stays silent: a resumed branch, created from its own remote image', async () => {
  const fx = scaffold()
  const remote = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-foreign-remote-')))
  try {
    execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })
    git(fx.dir, ['remote', 'add', 'origin', remote])
    git(fx.dir, ['push', '-q', 'origin', 'main'])
    // Somebody else's clone built it and pushed it; this clone never had it.
    git(fx.dir, ['switch', '-q', '-c', 'tmp'])
    commit(fx.dir, 'b1.txt', 'handed-over work')
    git(fx.dir, ['push', '-q', 'origin', 'tmp:feat/next'])
    git(fx.dir, ['switch', '-q', 'main'])
    git(fx.dir, ['branch', '-q', '-D', 'tmp'])
    git(fx.dir, ['fetch', '-q', 'origin'])
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), '--track', 'origin/feat/next'])
    commit(fx.wt('next'), 'b2.txt', 'more of it')
    const out = await integrate(fx)
    assert.match(out, /run these/)
    assert.doesNotMatch(out, /blocked/)
  } finally {
    cleanup(fx)
    fs.rmSync(remote, { recursive: true, force: true })
  }
})

test('stays silent: a commit carrying the spec\'s own Refs', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), 'main'])
    fs.writeFileSync(path.join(fx.wt('next'), 'b1.txt'), 'x\n')
    git(fx.wt('next'), ['add', '-A'])
    git(fx.wt('next'), ['commit', '-q', '-m', 'next fix\n\nRefs: #7'])
    const out = await integrate(fx)
    assert.match(out, /run these/)
    assert.doesNotMatch(out, /warning:/)
  } finally {
    cleanup(fx)
  }
})

test('integrate: another ticket\'s Refs or another spec\'s folder warns, and still plans', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), 'main'])
    fs.writeFileSync(path.join(fx.wt('next'), 'b1.txt'), 'x\n')
    git(fx.wt('next'), ['add', '-A'])
    git(fx.wt('next'), ['commit', '-q', '-m', 'other ticket\n\nRefs: #9'])
    commit(fx.wt('next'), 'specs/in-progress/feat-live/01-x.md', 'tick a phase of live')
    const out = await integrate(fx)
    assert.match(out, /warning: {3}[0-9a-f]+ other ticket — Refs: #9, not this spec's #7/)
    assert.match(out, /warning: {3}[0-9a-f]+ tick a phase of live — touches feat-live, not feat-next/)
    assert.match(out, /run these/, 'a warning never refuses')
  } finally {
    cleanup(fx)
  }
})

// Windows CI caught this one: Git for Windows checks the worktree's overview
// out CRLF, and the spec's own ticket read as null, so the Refs: warning went
// missing (bug-ticket-crlf-frontmatter). autocrlf reproduces it on any OS.
test('integrate: the Refs: warning survives a CRLF checkout (core.autocrlf)', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, ['config', 'core.autocrlf', 'true'])
    git(fx.dir, ['worktree', 'add', '-q', '-b', 'feat/next', fx.wt('next'), 'main'])
    const overview = fs.readFileSync(path.join(fx.wt('next'), 'specs', 'in-progress', 'feat-next', '00-overview.md'), 'utf8')
    assert.match(overview, /\r\n/, 'the checkout really is CRLF')
    fs.writeFileSync(path.join(fx.wt('next'), 'b1.txt'), 'x\n')
    git(fx.wt('next'), ['add', '-A'])
    git(fx.wt('next'), ['commit', '-q', '-m', 'other ticket\n\nRefs: #9'])
    const out = await integrate(fx)
    assert.match(out, /warning: {3}[0-9a-f]+ other ticket — Refs: #9, not this spec's #7/)
  } finally {
    cleanup(fx)
  }
})
