'use strict'

// bug-review-serve-spawn-sh. On Windows with Git for Windows installed but not
// on PATH (a `cmd /c` session, `prlctl exec`), `startProcess` spawned `sh`,
// which did not exist — and with no 'error' listener the ENOENT crashed the
// whole CLI after the old review server had already been stopped. Every review
// link went down mid-review.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { startProcess, resolveShell } = require('../src/env/supervise.js')
const { serveProcFor, daemonScript } = require('../src/cli.js')

const CONFIG = { registry: '.spec-env/registry.json' }
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-noshell-'))
const tick = () => new Promise((r) => setTimeout(r, 50))

test('a shell that cannot be spawned is reported, not thrown — and writes no pid file', async () => {
  const rootDir = tmpDir()
  const proc = {
    name: 'noshell',
    command: 'echo hi',
    // No `sh` anywhere on this PATH: the spawn fails with ENOENT.
    env: { PATH: path.join(rootDir, 'nowhere') },
    logFile: '.spec-env/logs/noshell.log',
    pidFile: '.spec-env/pids/noshell.pid',
  }
  const res = startProcess(proc, { cwd: rootDir, rootDir })
  // The ENOENT arrives as an 'error' event on the next tick; unhandled, it
  // takes the process down. Give it the chance to.
  await tick()
  assert.strictEqual(res.started, false)
  assert.strictEqual(res.pid, null)
  assert.match(res.error, /ENOENT|sh/)
  assert.strictEqual(fs.existsSync(path.resolve(rootDir, proc.pidFile)), false)
})

test('the review server is spawned as node itself — no shell in the way', () => {
  const root = '/repo'
  const file = '/repo/.spec-env/review-serve.json'
  const proc = serveProcFor(CONFIG, file, { root })
  assert.deepStrictEqual(proc.argv, [process.execPath, proc.script, file])
})

test("Windows finds Git for Windows' sh.exe when PATH has none", () => {
  const programFiles = 'C:\\Program Files'
  const want = path.win32.join(programFiles, 'Git', 'bin', 'sh.exe')
  const shell = resolveShell({
    platform: 'win32',
    env: { PATH: 'C:\\Windows\\system32', ProgramFiles: programFiles },
    exists: (p) => p === want,
  })
  assert.strictEqual(shell, want)
})

test('Windows with no sh anywhere answers null rather than guessing', () => {
  const shell = resolveShell({ platform: 'win32', env: { PATH: 'C:\\Windows' }, exists: () => false })
  assert.strictEqual(shell, null)
})

test("the daemon runs the primary checkout's copy of a superset distribution", () => {
  // Without this, an azure-boards project fell through to `__dirname` — the
  // running copy — so a worktree's engine saw the primary's server as running
  // a different script, called it stale, and stopped it.
  const root = tmpDir()
  const script = path.join(root, 'node_modules', '@skitterbyte', 'skitterspec-azure-boards', 'src', 'env', 'serve.js')
  fs.mkdirSync(path.dirname(script), { recursive: true })
  fs.writeFileSync(script, '')
  assert.strictEqual(daemonScript(root), script)
})

test('STAYS SILENT: POSIX keeps spawning sh from PATH', () => {
  assert.strictEqual(resolveShell({ platform: 'darwin', env: {}, exists: () => false }), 'sh')
})
