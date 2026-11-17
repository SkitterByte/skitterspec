'use strict'

/**
 * Commands a test hands the engine to run must run on Windows too.
 *
 * The engine spawns configured commands (`afterSwitch`, `afterLand`, `setup`,
 * `hotfix.releaseWith`) with `shell: true`, which is `/bin/sh` on macOS and
 * Linux and `cmd.exe` on Windows. A test written in sh — `mkdir -p`, `$(…)`,
 * `; exit 3` — passes on both of the platforms a release is cut on and fails
 * only in the Windows CI job, which first runs after the push. Three
 * afterSwitch tests did exactly that (bug-afterswitch-tests-windows).
 *
 * `node -e "…"` with single quotes inside is the portable form; the suite
 * already uses it elsewhere (cli-spec-env-worktree-side.test.js, WHERE).
 *
 * Only lines that hand a command to one of those keys are read. Reviewer
 * commands (`review.reviewers`) are deliberately out of scope: the engine runs
 * them through `sh` on every platform, Git for Windows' included
 * (`src/env/reviewers.js`), so sh is correct there.
 *
 * WHAT WOULD FOOL THIS: it matches source text, so a sh-only command built at
 * runtime, held in a variable declared away from its key, or spelled in a way
 * not listed below, passes unseen.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const PACKAGES = path.join(__dirname, '..', '..')

// sh constructs cmd.exe does not understand.
const SH_ONLY = [
  { name: '`mkdir -p` (cmd makes a directory called -p)', re: /mkdir -p /g },
  { name: '`$(…)` command substitution', re: /\$\([a-z]/g },
  { name: '`; exit N` (cmd ignores `;`)', re: /; exit \d/g },
]

function testFiles() {
  const out = []
  for (const pkg of fs.readdirSync(PACKAGES)) {
    const dir = path.join(PACKAGES, pkg, 'test')
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.test.js') && f !== path.basename(__filename)) out.push(path.join(dir, f))
    }
  }
  return out
}

// The keys whose commands the engine spawns with `shell: true`.
const ENGINE_SHELL = /\brun:|setAfterSwitch\(|afterSwitch|afterLand|setup:|releaseWith/

// A hit is the construct inside a quoted string literal, on a line that hands
// a command to one of those keys.
function hits(text) {
  const found = []
  text.split('\n').forEach((line, i) => {
    if (!ENGINE_SHELL.test(line)) return
    for (const lit of line.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || []) {
      for (const { name, re } of SH_ONLY) {
        if (new RegExp(re.source).test(lit)) found.push(`${i + 1}: ${name}: ${lit}`)
      }
    }
  })
  return found
}

test('no test hands the engine a shell command only sh understands', () => {
  const found = testFiles().flatMap((f) => hits(fs.readFileSync(f, 'utf8')).map((h) => `${path.relative(PACKAGES, f)}:${h}`))
  assert.deepStrictEqual(found, [], `sh-only commands fail on Windows CI — use node -e "…":\n  ${found.join('\n  ')}`)
})

test('the guard fires on each construct, and stays silent on the portable form', () => {
  assert.strictEqual(hits(`run: 'mkdir -p .spec-env && echo x'`).length, 1)
  assert.strictEqual(hits(`run: 'echo "$(git branch --show-current)"'`).length, 1)
  assert.strictEqual(hits(`setAfterSwitch(dir, ['echo boom; exit 3'])`).length, 1)
  assert.deepStrictEqual(hits(`run: \`node -e "require('fs').mkdirSync('.spec-env', { recursive: true })"\``), [])
  assert.deepStrictEqual(hits('// mkdir -p in a comment is prose, not a command'), [])
  // A reviewer command runs under sh everywhere, so sh syntax is right there.
  assert.deepStrictEqual(hits("command: `printf 'x\\n' >&2; exit 1`,"), [])
})
