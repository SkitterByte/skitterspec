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

// A spawn that failed the way a missing `sh` fails: no pid, and the ENOENT
// emitted on the next tick, exactly as `child_process.spawn` delivers it.
//
// INJECTED, NOT ARRANGED. This test once emptied PATH and trusted that left no
// shell — but `startProcess` merges `process.env`, and on Windows `resolveShell`
// also finds Git for Windows under ProgramFiles, which every GitHub runner has.
// There the shell started and the test failed. What the machine lacks is not
// something a test can set up, so the failure is supplied here instead.
function failedSpawn() {
  const { EventEmitter } = require('node:events')
  const calls = []
  const spawnImpl = (file, args) => {
    calls.push(file)
    const child = new EventEmitter()
    child.pid = undefined
    child.unref = () => {}
    process.nextTick(() => {
      const err = new Error(`spawn ${file} ENOENT`)
      err.code = 'ENOENT'
      child.emit('error', err)
    })
    return child
  }
  return { spawnImpl, calls }
}

test('a shell that cannot be spawned is reported, not thrown — and writes no pid file', async () => {
  const rootDir = tmpDir()
  const proc = {
    name: 'noshell',
    command: 'echo hi',
    logFile: '.spec-env/logs/noshell.log',
    pidFile: '.spec-env/pids/noshell.pid',
  }
  const { spawnImpl, calls } = failedSpawn()
  const res = startProcess(proc, { cwd: rootDir, rootDir, spawnImpl })
  // The ENOENT arrives as an 'error' event on the next tick; unhandled, it
  // takes the process down. Give it the chance to.
  await tick()
  assert.strictEqual(calls.length, 1, 'the spawn was attempted')
  assert.strictEqual(res.started, false)
  assert.strictEqual(res.pid, null)
  assert.match(res.error, /could not start/)
  assert.strictEqual(fs.existsSync(path.resolve(rootDir, proc.pidFile)), false)
})

test('STAYS SILENT: the answer does not depend on a shell being reachable', async () => {
  // The Windows runner's world: a real shell on PATH. The injected failure
  // still decides, so this machine's toolchain cannot flip the result.
  const rootDir = tmpDir()
  const proc = {
    name: 'withshell',
    command: 'echo hi',
    env: { PATH: process.env.PATH },
    logFile: '.spec-env/logs/withshell.log',
    pidFile: '.spec-env/pids/withshell.pid',
  }
  const res = startProcess(proc, { cwd: rootDir, rootDir, spawnImpl: failedSpawn().spawnImpl })
  await tick()
  assert.strictEqual(res.started, false)
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
