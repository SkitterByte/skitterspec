'use strict'

/**
 * An older engine must never replace a newer review server.
 *
 * In ereqs on 2026-11-23 a review rendered from a hotfix worktree pinned at an
 * old release ran that worktree's engine (2.5.0). It found the shared server on
 * 2.19.0, called it stale because the versions differed, and restarted it on
 * 2.5.0. Every page was then drawn by an engine three months older. A version
 * mismatch only means "replace" when the running server is the OLDER one.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')

const { staleServer } = require('../src/env/serve.js')
const { ensureReviewServer, daemonScript } = require('../src/cli.js')
const { loadEnvConfig } = require('../src/env/config.js')

// --- the verdict --------------------------------------------------------------

test('a server running a NEWER engine than this one is newer, not stale', () => {
  assert.strictEqual(staleServer('9.3.1', '9.2.0'), 'newer')
  assert.strictEqual(staleServer('10.0.0', '9.20.0'), 'newer', 'numeric, not lexical')
  assert.strictEqual(staleServer('9.2.0', '9.2.0-rc.1'), 'newer', 'a release is newer than its pre-release')
})

test('stays silent: an older server is still stale, and same-version keeps the mtime check', () => {
  assert.strictEqual(staleServer('9.2.0', '9.3.1'), 'stale')
  assert.strictEqual(staleServer('0.0.0-old', '1.0.0'), 'stale')
  assert.strictEqual(staleServer('9.2.0', '9.2.0', 1, 2), 'stale', 'a rebuild under one version')
  assert.strictEqual(staleServer('9.2.0', '9.2.0', 1, 1), 'current')
})

test('stays silent: versions that cannot be ordered replace exactly as before', () => {
  assert.strictEqual(staleServer('dev', '9.2.0'), 'stale')
  assert.strictEqual(staleServer('9.2.0', 'dev'), 'stale')
})

// --- the adoption, end to end --------------------------------------------------

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-downgrade-')))
  execFileSync('git', ['-C', dir, 'init', '-q'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }),
  )
  return dir
}

test('an older engine adopts the newer running server and keeps its token', async () => {
  const dir = repo()
  // A live process standing in for the newer server. Its pid is what decides
  // "running"; nothing here needs it to answer HTTP.
  const stand = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e6)'], { stdio: 'ignore' })
  const pidFile = path.join(dir, '.spec-env', 'pids', 'review-serve.pid')
  try {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true })
    fs.writeFileSync(pidFile, String(stand.pid))
    fs.writeFileSync(
      path.join(dir, '.spec-env', 'review-serve.json'),
      JSON.stringify({ dir, port: 7999, host: '0.0.0.0', token: 'keepme', engine: '999.0.0', script: daemonScript(dir) }),
    )
    const { config } = loadEnvConfig(dir)
    const up = await ensureReviewServer(dir, config, { host: '0.0.0.0' })
    assert.strictEqual(up.error, undefined, JSON.stringify(up))
    assert.strictEqual(up.started, false, 'nothing was started')
    assert.strictEqual(up.engine, 'newer')
    assert.strictEqual(up.engineWas, '999.0.0')
    assert.strictEqual(up.token, 'keepme', 'the link on the phone still works')
    assert.strictEqual(up.pid, stand.pid)
    assert.doesNotThrow(() => process.kill(stand.pid, 0), 'the newer server is still alive')
  } finally {
    // In the red state the old code replaced the stand-in with a real daemon.
    const pid = Number(fs.readFileSync(pidFile, 'utf8'))
    for (const p of new Set([stand.pid, pid])) {
      try {
        process.kill(p)
      } catch {}
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the render says it kept the newer server, loudly', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')
  assert.match(src, /up\.engine === 'newer'/)
  assert.match(src, /newer than this one \(\$\{up\.engineIs\}\) — kept it/)
})
