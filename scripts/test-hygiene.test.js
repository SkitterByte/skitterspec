'use strict'

/**
 * A test may not kill a supervised process by its recorded pid alone.
 *
 * WHAT THIS IS ABOUT. `startProcess` (packages/common/src/env/supervise.js)
 * spawns every supervised process as `sh -c "<command>"` with `detached: true`,
 * so the pid written to the pidfile is the **shell's**. Where the shell execs
 * the command that pid is also the server's, and a bare kill works. Where it
 * forks — which is what happened on the Linux runners and not on macOS — the
 * real server is a child, survives the kill, and goes on holding its port. The
 * product handles this with `signalGroup(pid, sig)`, which signals `-pid`.
 *
 * THE BILL. `env-review-reader.test.js` killed the leader and asserted on a
 * re-render. It passed on macOS on every run and failed on every Linux runner,
 * which is the worst shape a test can have: green where it is written, red where
 * it is trusted. It cost two release workflows, and the first fix aimed at the
 * wrong cause because the symptom — a `file://` fallback — looked like a timing
 * race rather than a server that had never died.
 *
 * Prose had already lost this one: `signalGroup` exists, is exported, and
 * carries a comment saying exactly why. So this is a check rather than another
 * paragraph.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

/**
 * Every `process.kill(...)` call in a test file that is NOT one of the two
 * legitimate forms.
 *
 * A POSITIVE SIGNAL: it looks for a call that is present, not for a call that is
 * missing. An absence here would prove nothing — a test that kills nothing is
 * the overwhelmingly common case, and is exactly what we want.
 *
 * The two forms it deliberately does not flag:
 *
 *   - `process.kill(-pid, sig)` — the group form. That is the correct one.
 *   - `process.kill(pid, 0)`    — signal 0 is a liveness PROBE. It kills
 *                                 nothing, and `isAlive` is built on it.
 *
 * WHAT WOULD FOOL THIS CHECK, named here so the next reader can weigh it:
 *
 *   - it is a regex over source, so a kill assembled at runtime
 *     (`process[k](pid, sig)`, or a signal held in a variable that happens to be
 *     `0`) is invisible to it. It is a door-closer, not a proof.
 *   - it only reads `packages/<pkg>/test/*.js`. A helper that moved into
 *     `src/` and kills on a test's behalf would not be seen.
 *   - a file that legitimately kills a process it spawned ITSELF — not a
 *     supervised one — is indistinguishable here from one that kills a
 *     pidfile's leader. That is why ALLOWED exists rather than the check trying
 *     to be clever about provenance.
 *
 * Being wrong costs a false accusation on a healthy test, so the escape hatch is
 * an explicit list with a reason, in the file, rather than a heuristic.
 */
const ALLOWED = new Map([
  // <relative path>#<line content fragment> → why it is fine.
  // Empty today: the one site that matched now uses signalGroup. An entry here
  // must say WHY the leader pid is the whole process, not merely that someone
  // wanted the check quiet.
])

function testFiles() {
  const out = []
  const pkgs = path.join(ROOT, 'packages')
  for (const pkg of fs.readdirSync(pkgs)) {
    const dir = path.join(pkgs, pkg, 'test')
    let entries
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue // a package with no test folder is not a finding
    }
    for (const name of entries) {
      if (name.endsWith('.js')) out.push(path.join(dir, name))
    }
  }
  return out
}

// A `process.kill(` call, with what it was passed. Comments are stripped first
// so a line DESCRIBING the wrong form — this file's own doc comment, and the
// one in env-review-reader.test.js — is not read as doing it.
function bareKills(source) {
  const hits = []
  source.split('\n').forEach((raw, i) => {
    const line = raw.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
    const m = /process\.kill\(\s*([^,)]+)\s*,\s*([^)]*)\)/.exec(line)
    if (!m) return
    const target = m[1].trim()
    const signal = m[2].trim()
    if (target.startsWith('-')) return // the group form — correct
    if (signal === '0') return // a liveness probe — kills nothing
    hits.push({ line: i + 1, target, signal, text: raw.trim() })
  })
  return hits
}

test('no test kills a supervised process by its leader pid alone', () => {
  const found = []
  for (const file of testFiles()) {
    const rel = path.relative(ROOT, file)
    for (const hit of bareKills(fs.readFileSync(file, 'utf8'))) {
      const excused = [...ALLOWED.keys()].some(
        (k) => k.startsWith(rel + '#') && hit.text.includes(k.split('#')[1]),
      )
      if (!excused) found.push(`${rel}:${hit.line}  ${hit.text}`)
    }
  }
  assert.deepStrictEqual(
    found,
    [],
    'these kill the `sh -c` wrapper, not the process it spawned — on Linux the\n' +
      'child survives and keeps its port. Use `signalGroup(pid, sig)` from\n' +
      'packages/common/src/env/supervise.js, as `stopProcess` does:\n  ' +
      found.join('\n  '),
  )
})

// --- STAYS SILENT: the healthy-but-unusual inputs ---------------------------
//
// Every one of these is a shape a real test legitimately contains. A check that
// fired on any of them would be an accusation against working code, and would be
// switched off rather than answered.

test('STAYS SILENT: the group form is what the check wants, not what it flags', () => {
  assert.deepStrictEqual(bareKills("  process.kill(-pid, 'SIGKILL')"), [])
  assert.deepStrictEqual(bareKills('  process.kill(-leader, sig)'), [])
})

test('STAYS SILENT: signal 0 is a liveness probe and kills nothing', () => {
  // `isAlive` is built on exactly this, and `cli-spec-env-dev.test.js` asserts
  // with it. Flagging it would accuse the idiom the product itself uses.
  assert.deepStrictEqual(bareKills('  process.kill(pid, 0)'), [])
  assert.deepStrictEqual(bareKills('  assert.throws(() => process.kill(pid, 0))'), [])
})

test('STAYS SILENT: prose about the wrong form is not the wrong form', () => {
  // This file and env-review-reader.test.js both DESCRIBE the bad call in a
  // comment. A check that could not tell a description from a call would fire on
  // the very documentation written to prevent it.
  assert.deepStrictEqual(bareKills("  // never a bare `process.kill(pid, 'SIGKILL')`"), [])
  assert.deepStrictEqual(bareKills(" * killing with process.kill(pid, 'SIGTERM') hits the wrapper"), [])
})

test('STAYS SILENT: a package with no test folder is not a finding', () => {
  // `testFiles` skips an unreadable directory rather than throwing. A new
  // package that has not grown tests yet must not fail this.
  assert.ok(Array.isArray(testFiles()), 'it enumerates rather than throwing')
})

// --- and it can still fire --------------------------------------------------

test('the check can fire — it is not vacuously green', () => {
  // The positive half. Without this, every assertion above would pass on a
  // check that had quietly stopped matching anything at all.
  const hits = bareKills("    process.kill(pid, 'SIGKILL')")
  assert.strictEqual(hits.length, 1)
  assert.strictEqual(hits[0].target, 'pid')
  assert.strictEqual(hits[0].signal, "'SIGKILL'")
})

test('the real suite is what it is run against, and it finds files there', () => {
  // Guards the blind spot above: a glob that matched nothing would make the
  // headline test green by scanning an empty set.
  const files = testFiles()
  assert.ok(files.length > 40, `expected the real test corpus, found ${files.length} files`)
  assert.ok(
    files.some((f) => f.endsWith('env-review-reader.test.js')),
    'including the file this check was written for',
  )
})
