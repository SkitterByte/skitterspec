'use strict'

/**
 * Process-supervision IO for host dev servers — the side-effecting seam the CLI
 * drives (the planning lives in the pure `dev.js`). Keeps `cli.js` thin and lets
 * start/stop/health be exercised against a fixture server in tests.
 *
 * A "proc" here is one entry from `planDev(...).procs` (it carries `command`,
 * `env`, `logFile`, `pidFile`, `health`). Log/pid paths are relative to the
 * primary checkout root, resolved against `rootDir`.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function resolveState(rootDir, rel) {
  return path.resolve(rootDir, rel)
}

// Is `pid` a live process? `kill(pid, 0)` probes without signalling.
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM → exists but not ours; still "alive" for our purposes.
    return err.code === 'EPERM'
  }
}

// Signal a detached process's whole group (its leader pid is `pid`, so the group
// id is `-pid`) — reaches children like vite/tsc that a bare `pnpm dev` spawns.
// Falls back to signalling just the leader if the group send fails.
//
// WINDOWS HAS NO PROCESS GROUPS: `-pid` throws, the fallback kills only the
// `sh` wrapper, and the server it started survives — holding its port and its
// worktree, which then cannot be removed (chore-windows-ci). `taskkill /T` walks
// the tree instead; `/F` for both signals, because a console process ignores
// the polite close a bare `taskkill` sends. Run with an argument list, never a
// shell. `opts` is injectable for tests.
function signalGroup(pid, sig, { platform = process.platform, run = spawnSync } = {}) {
  if (platform === 'win32') {
    run('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try {
    process.kill(-pid, sig)
  } catch {
    try {
      process.kill(pid, sig)
    } catch {
      /* already gone */
    }
  }
}

// Read a pid from its file (absolute path). null when missing/malformed.
function readPid(pidFileAbs) {
  try {
    const n = Number(fs.readFileSync(pidFileAbs, 'utf-8').trim())
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * The shell a planned `command` runs through, or null when there is none.
 *
 * POSIX: `sh` from PATH, as it always was. Windows: `sh` only exists where Git
 * for Windows put its `bin` on PATH, and a `cmd /c` session (a VM driven from
 * another host, a scheduled task) commonly has Git installed and not on PATH.
 * So PATH first, then Git's own install locations, then the `bin` beside a
 * `git.exe` that IS on PATH (`Git\cmd\git.exe` → `Git\bin\sh.exe`).
 *
 * WHAT WOULD FOOL THIS: Git installed somewhere none of those name — a scoop
 * shim, a portable copy. Then the answer is null, and the caller refuses with
 * a reason rather than spawning something that is not there.
 */
function resolveShell({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (platform !== 'win32') return 'sh'
  const w = path.win32
  const dirs = String(env.PATH || env.Path || '').split(';').filter(Boolean)
  const candidates = dirs.map((d) => w.join(d, 'sh.exe'))
  for (const base of [env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)']]) {
    if (base) candidates.push(w.join(base, 'Git', 'bin', 'sh.exe'))
  }
  if (env.LOCALAPPDATA) candidates.push(w.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'sh.exe'))
  for (const d of dirs) {
    if (exists(w.join(d, 'git.exe'))) candidates.push(w.join(d, '..', 'bin', 'sh.exe'))
  }
  return candidates.find((c) => exists(c)) || null
}

/**
 * Start one planned process detached, appending stdout+stderr to its log and
 * writing its pid file. Idempotent: if the pid file already names a live
 * process, nothing is spawned — returns `{ started: false, pid }`.
 *
 * A proc carrying `argv` is spawned as exactly that, with no shell — the review
 * server and the proxy are `node <script> <file>` and never needed one. A proc
 * carrying only `command` runs through `resolveShell`.
 *
 * NEVER THROWS OVER A SPAWN THAT FAILED. A missing executable is reported as
 * `{ started: false, pid: null, error }` with no pid file written: the ENOENT
 * otherwise arrives as an unhandled 'error' event and takes the CLI down with
 * it (bug-review-serve-spawn-sh).
 *
 * `spawnImpl` is injectable for tests; defaults to child_process.spawn.
 */
function startProcess(proc, { cwd, rootDir, spawnImpl = spawn }) {
  const logAbs = resolveState(rootDir, proc.logFile)
  const pidAbs = resolveState(rootDir, proc.pidFile)

  const existing = readPid(pidAbs)
  if (existing && isAlive(existing)) {
    return { started: false, pid: existing, logFile: logAbs, pidFile: pidAbs }
  }

  const env = { ...process.env, ...proc.env }
  let file
  let args
  if (proc.argv) {
    ;[file, ...args] = proc.argv
  } else {
    file = resolveShell({ env })
    args = ['-c', proc.command]
    if (!file) {
      const error = 'no sh found — install Git for Windows or put its bin folder on PATH'
      return { started: false, pid: null, error, logFile: logAbs, pidFile: pidAbs }
    }
  }

  fs.mkdirSync(path.dirname(logAbs), { recursive: true })
  fs.mkdirSync(path.dirname(pidAbs), { recursive: true })

  const out = fs.openSync(logAbs, 'a')
  try {
    let child
    try {
      child = spawnImpl(file, args, {
        cwd,
        env,
        detached: true,
        // No console window per dev server on Windows; nothing anywhere else.
        windowsHide: true,
        stdio: ['ignore', out, out],
      })
    } catch (err) {
      return { started: false, pid: null, error: `spawn ${file}: ${err.message}`, logFile: logAbs, pidFile: pidAbs }
    }
    // A spawn that could not start has no pid, and its error is emitted on the
    // next tick — the listener is what keeps that from being fatal.
    child.on('error', () => {})
    if (!child.pid) {
      return { started: false, pid: null, error: `could not start ${file}`, logFile: logAbs, pidFile: pidAbs }
    }
    child.unref()
    fs.writeFileSync(pidAbs, `${child.pid}\n`)
    return { started: true, pid: child.pid, logFile: logAbs, pidFile: pidAbs }
  } finally {
    fs.closeSync(out)
  }
}

/**
 * Stop one planned process: SIGTERM its pid, wait up to `graceMs` for it to
 * exit, then SIGKILL if still alive. Removes the pid file either way. Idempotent
 * — a missing/dead pid is a clean no-op. Returns `{ stopped, pid }`.
 */
async function stopProcess(proc, { rootDir, graceMs = 3000, now = () => Date.now(), wait = sleep } = {}) {
  const pidAbs = resolveState(rootDir, proc.pidFile)
  const pid = readPid(pidAbs)
  let stopped = false

  if (pid && isAlive(pid)) {
    signalGroup(pid, 'SIGTERM')
    const deadline = now() + graceMs
    while (now() < deadline && isAlive(pid)) await wait(100)
    if (isAlive(pid)) signalGroup(pid, 'SIGKILL')
    stopped = true
  }

  try {
    fs.unlinkSync(pidAbs)
  } catch {
    /* no pid file → nothing to clean */
  }
  return { stopped, pid }
}

/**
 * Poll `url` until it answers (any HTTP status counts as "up") or `timeoutMs`
 * elapses. Returns true when reachable, false on timeout. A null/empty url means
 * "no health gate" → true immediately. `fetchImpl`/`now`/`wait` are injectable
 * for deterministic tests.
 */
async function waitHealthy(
  url,
  { timeoutMs = 30000, intervalMs = 500, fetchImpl = fetch, now = () => Date.now(), wait = sleep } = {},
) {
  if (!url) return true
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), intervalMs)
      try {
        await fetchImpl(url, { signal: ctrl.signal })
        return true
      } finally {
        clearTimeout(t)
      }
    } catch {
      /* not up yet */
    }
    await wait(intervalMs)
  }
  return false
}

// `signalGroup` is exported for TESTS that need to simulate a process dying.
// Killing the recorded pid alone is not that simulation: the pid is the detached
// `sh -c` leader, and where the shell forks rather than execs, the real server
// is its child and survives. A test that reaches for `process.kill(pid, …)`
// therefore kills the wrapper, leaves the server holding its port, and then
// blames whatever it asserts next. Killing the group is what `stopProcess` does
// and what a test must do to mean "it died".
module.exports = { startProcess, stopProcess, waitHealthy, isAlive, readPid, signalGroup, resolveShell }
