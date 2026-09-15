'use strict'

/**
 * The toolchain the repo is developed with must not contradict what it ships.
 *
 * `.nvmrc` records the Node a contributor should be running locally; the
 * manifests' `engines.node` records the floor consumers are promised. A pin
 * below that floor means the person maintaining the packages is not running
 * code the packages claim to support — which is how a floor stops being tested
 * by anyone at all. (CI's matrix is a separate question and deliberately not
 * coupled here: see `workflows.test.js`.)
 *
 * WHAT WOULD MAKE A NAIVE CHECK LIE: `.nvmrc` is a loose format and nvm/fnm
 * accept far more than a full semver triple. `v24.21.0`, a bare major `24`, a
 * trailing newline, surrounding whitespace and an LTS codename (`lts/krypton`)
 * are all valid and all healthy, and a parser that understands only `24.21.0`
 * accuses every one of them. Worse, a bare `22` means "the newest 22.x", which
 * really does satisfy `>=22.13` — so comparing it as the literal `22.0.0` would
 * fail a pin that is correct.
 *
 * So this reads three states, not two, and routes the third to silence:
 * `ok`, `below`, and `unknown`. Only `below` accuses.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, manifestEngines, floorOf, cmpVersion } = require('./lib/engines.js')

// --- pure helpers -----------------------------------------------------------

/**
 * The version a `.nvmrc` names, or null when it names something this cannot
 * resolve to a number — a codename, an alias, an empty file.
 */
function nvmrcVersion(text) {
  const line = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  if (!line) return null
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(line)
  return m ? m[1] : null
}

/**
 * `ok` · `below` · `unknown`. A pin less precise than the floor but agreeing on
 * every part it does state (`22` against `22.13`) is `unknown`, not `below`:
 * nvm and fnm resolve it to the newest release of that line, which satisfies
 * the floor.
 */
function verdict(version, floor) {
  if (!version || !floor) return 'unknown'
  const pv = version.split('.')
  const pf = floor.split('.')
  if (pv.length < pf.length) {
    const sharedPrefix = pv.every((part, i) => Number(part) === Number(pf[i]))
    if (sharedPrefix) return 'unknown'
  }
  return cmpVersion(version, floor) >= 0 ? 'ok' : 'below'
}

// --- the real corpus --------------------------------------------------------

test('the .nvmrc pin is not below the floor the manifests declare', () => {
  const floor = floorOf(manifestEngines()[0][1])
  assert.ok(floor, 'engines.node is not a plain ">=x.y" range')

  const pinned = nvmrcVersion(fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8'))
  assert.notStrictEqual(
    verdict(pinned, floor),
    'below',
    `.nvmrc pins ${pinned}, below the ${floor} floor engines.node declares`,
  )
})

test('the root packageManager names a pnpm version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.match(String(pkg.packageManager), /^pnpm@\d+\.\d+\.\d+/)
})

// --- the check fires --------------------------------------------------------

test('a pin genuinely below the floor is caught', () => {
  assert.strictEqual(verdict(nvmrcVersion('18.20.8\n'), '22.13'), 'below')
  assert.strictEqual(verdict(nvmrcVersion('20\n'), '22.13'), 'below')
})

// --- the check stays silent -------------------------------------------------

test('healthy but unusual .nvmrc content is not accused', () => {
  for (const content of [
    '24.21.0\n',
    'v24.21.0\n',
    '24\n',
    '  24.21.0  \n',
    '24.21.0',
    '22\n',
    'lts/krypton\n',
    'node\n',
    '\n',
    '',
  ]) {
    assert.notStrictEqual(
      verdict(nvmrcVersion(content), '22.13'),
      'below',
      `accused a healthy .nvmrc: ${JSON.stringify(content)}`,
    )
  }
})

test('an unparseable floor yields no verdict, rather than a wrong one', () => {
  assert.strictEqual(verdict('24.21.0', floorOf('^22.13')), 'unknown')
  assert.strictEqual(verdict('24.21.0', floorOf('')), 'unknown')
})
