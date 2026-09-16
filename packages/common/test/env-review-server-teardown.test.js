'use strict'

/**
 * Accounting for a server nobody started.
 *
 * `spec-env review` stands a LAN server up on its own when the reader is
 * remote, and one path token unlocks every provisioned spec's diff for as long
 * as it runs. Typed by hand, the operator knows it is up. Started for them,
 * nobody does — so teardown has to name it.
 *
 * Most of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3). The expensive mistake is telling someone to stop a server that other
 * specs still need, or that already died — both accuse a healthy teardown.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { reviewServerNotice } = require('../src/env/review.js')
const { run } = require('../src/cli.js')

// --- what to say ------------------------------------------------------------

test('the last spec a running server served is told how to stop it', () => {
  const lines = reviewServerNotice({ running: true, othersServed: 0 })
  assert.match(lines.join('\n'), /last spec it served/)
  assert.match(lines.join('\n'), /review serve --stop/)
})

// It is still doing its job for the others, so teardown has nothing to report.
test('stays silent while other specs are still served', () => {
  assert.deepStrictEqual(reviewServerNotice({ running: true, othersServed: 1 }), [])
  assert.deepStrictEqual(reviewServerNotice({ running: true, othersServed: 9 }), [])
})

// Rule 3 again, and the one that matters most: no server running is the
// ORDINARY state of a teardown. Reporting it would accuse every healthy one.
test('stays silent when no server is running', () => {
  assert.deepStrictEqual(reviewServerNotice({ running: false, othersServed: 0 }), [])
  assert.deepStrictEqual(reviewServerNotice({ running: false, othersServed: 3 }), [])
})

// --- reaping a pidfile whose process is gone --------------------------------

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-rst-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  g('branch', '-M', 'main')
  return dir
}

function pidFile(dir) {
  return path.join(dir, '.spec-env', 'pids', 'review-serve.pid')
}

function writePid(dir, pid) {
  fs.mkdirSync(path.dirname(pidFile(dir)), { recursive: true })
  fs.writeFileSync(pidFile(dir), String(pid))
}

async function prune(dir) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(['spec-env', 'prune', '--dir', dir])
  } finally {
    process.stdout.write = orig
  }
  return out
}

test('prune reaps a pidfile whose process is gone', async () => {
  const dir = scaffold()
  try {
    // A pid that cannot be alive: the kernel reserves 0, and `process.kill(0, 0)`
    // does not address a real process.
    writePid(dir, 999999)
    const out = await prune(dir)
    assert.match(out, /stale review-server pidfile/)
    assert.ok(!fs.existsSync(pidFile(dir)), 'the file is gone, not merely reported')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// The live server's record is what `--stop` needs to kill it. Deleting it would
// strand a listening process with nothing left pointing at it.
test('prune leaves a live pidfile alone', async () => {
  const dir = scaffold()
  try {
    writePid(dir, process.pid)
    const out = await prune(dir)
    assert.doesNotMatch(out, /stale review-server pidfile/)
    assert.ok(fs.existsSync(pidFile(dir)), 'a running server keeps its record')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('prune says nothing about a server on a repo that never ran one', async () => {
  const dir = scaffold()
  try {
    const out = await prune(dir)
    assert.doesNotMatch(out, /review-server/)
    assert.doesNotMatch(out, /review serve/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- what `down` actually prints --------------------------------------------

// The pure function's tests cover the policy; these drive the real CLI over a
// real repo, because the property that matters is whether the FACTS reach it —
// a policy test would still pass if `othersServed` were always zero.
function scaffoldSpecs(names) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-rsd-')))
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g(dir, 'init', '-q')
  g(dir, 'config', 'user.email', 'test@example.com')
  g(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      docker: { enabled: false },
      review: { reader: 'local', serve: 'never' },
      guards: { refuseTeardownIfDirty: false, refuseTeardownIfUnpushed: false },
    }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  for (const n of names) {
    const sd = path.join(dir, 'specs', 'in-progress', n)
    fs.mkdirSync(sd, { recursive: true })
    fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  }
  g(dir, 'add', '-A')
  g(dir, 'commit', '-q', '-m', 'init')
  g(dir, 'branch', '-M', 'main')
  for (const n of names) {
    const slug = n.replace(/^feat-/, '')
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
    g(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, wt)
  }
  return dir
}

function cleanupSpecs(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function down(dir, spec) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(['spec-env', 'down', spec, '--dir', dir])
  } finally {
    process.stdout.write = orig
  }
  return out
}

test('down names the server when this was the last spec it served', async () => {
  const dir = scaffoldSpecs(['feat-alpha'])
  try {
    // `process.pid` is alive by construction — the point is a RUNNING server,
    // not a file that happens to exist.
    writePid(dir, process.pid)
    const out = await down(dir, 'feat-alpha')
    assert.match(out, /last spec it served/)
    assert.match(out, /review serve --stop/)
  } finally {
    cleanupSpecs(dir)
  }
})

// STAYS SILENT: the server is still doing its job for beta, and telling someone
// to stop it would break a diff they may have open right now.
test('down says nothing while another spec is still provisioned', async () => {
  const dir = scaffoldSpecs(['feat-alpha', 'feat-beta'])
  try {
    writePid(dir, process.pid)
    const out = await down(dir, 'feat-alpha')
    assert.doesNotMatch(out, /last spec it served/)
    assert.doesNotMatch(out, /review serve --stop/)
  } finally {
    cleanupSpecs(dir)
  }
})

test('down on a repo with no server running mentions none', async () => {
  const dir = scaffoldSpecs(['feat-alpha'])
  try {
    const out = await down(dir, 'feat-alpha')
    assert.doesNotMatch(out, /review serve/)
  } finally {
    cleanupSpecs(dir)
  }
})
