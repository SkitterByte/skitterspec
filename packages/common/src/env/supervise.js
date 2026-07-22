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
const { spawn } = require('node:child_process')

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
function signalGroup(pid, sig) {
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
 * Start one planned process detached, appending stdout+stderr to its log and
 * writing its pid file. Idempotent: if the pid file already names a live
 * process, nothing is spawned — returns `{ started: false, pid }`.
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

  fs.mkdirSync(path.dirname(logAbs), { recursive: true })
  fs.mkdirSync(path.dirname(pidAbs), { recursive: true })

  const out = fs.openSync(logAbs, 'a')
  try {
    const child = spawnImpl('sh', ['-c', proc.command], {
      cwd,
      env: { ...process.env, ...proc.env },
      detached: true,
      stdio: ['ignore', out, out],
    })
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

module.exports = { startProcess, stopProcess, waitHealthy, isAlive, readPid }
