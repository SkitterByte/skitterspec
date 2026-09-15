'use strict'

// Two things about the CI workflow are load-bearing rather than cosmetic, and
// both are invisible on a green run:
//
// 1. The matrix floor must equal `engines.node`. The floor moved to >= 22.13
//    because pnpm 11.11 requires it AND this repo's suite cannot run without an
//    install — a bare checkout discovers 1825 tests of 2362 and fails 41. A
//    manifest floor nobody tests is a promise nobody is keeping, which is the
//    state this repo was in at `>=18`.
//
// 2. No `registry-url` on `actions/setup-node`, in EITHER workflow. It writes an
//    `.npmrc` carrying an `_authToken`; with no token that resolves empty, npm
//    decides the registry is token-authenticated, never performs the OIDC
//    exchange, and the anonymous PUT comes back 404 — npm returns 404 rather
//    than 403 so it does not leak whether a package exists. release.yml is where
//    that costs a failed publish; ci.yml is guarded too so the option cannot be
//    copied across from a file where it looked harmless.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const WORKFLOWS = path.join(ROOT, '.github', 'workflows')

// --- pure helpers -----------------------------------------------------------

/**
 * Drop comment lines before looking for configuration.
 *
 * WHAT WOULD MAKE A NAIVE CHECK LIE: this workflow *documents* why it omits
 * `registry-url`, so the string is present in the file while the setting is
 * not. A grep would fail the very file that got it right — an accusation
 * produced by the explanation of the correct behaviour.
 */
function withoutComments(yaml) {
  return yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

/** True when the workflow actually SETS registry-url, comments aside. */
function setsRegistryUrl(yaml) {
  return /^\s*registry-url\s*:/m.test(withoutComments(yaml))
}

/** The quoted node versions in a `node:` matrix list, in file order. */
function matrixNodeVersions(yaml) {
  const m = /^\s*node:\s*\[([^\]]*)\]/m.exec(withoutComments(yaml))
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

/** "\>=22.13" → "22.13"; anything else → null rather than a guess. */
function floorOf(range) {
  const m = /^>=\s*(\d+(?:\.\d+)*)$/.exec(String(range || '').trim())
  return m ? m[1] : null
}

function cmpVersion(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

function lowest(versions) {
  return versions.slice().sort(cmpVersion)[0] ?? null
}

// --- the real corpus --------------------------------------------------------

function manifestEngines() {
  const out = [['package.json', readJson(path.join(ROOT, 'package.json'))]]
  const pkgs = path.join(ROOT, 'packages')
  for (const name of fs.readdirSync(pkgs).sort()) {
    const f = path.join(pkgs, name, 'package.json')
    if (fs.existsSync(f)) out.push([`packages/${name}/package.json`, readJson(f)])
  }
  return out.map(([rel, pkg]) => [rel, pkg.engines && pkg.engines.node])
}

function readJson(f) {
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}

test('every manifest declares the same node floor', () => {
  const engines = manifestEngines()
  const floors = new Set(engines.map(([, node]) => node))
  assert.strictEqual(
    floors.size,
    1,
    `manifests disagree about engines.node:\n  ${engines.map(([r, n]) => `${r}: ${n}`).join('\n  ')}`,
  )
})

test('ci.yml tests the floor the manifests declare', () => {
  const yaml = fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8')
  const declared = floorOf(manifestEngines()[0][1])
  assert.ok(declared, 'engines.node is not a plain ">=x.y" range')

  const versions = matrixNodeVersions(yaml)
  assert.ok(versions.length > 0, 'ci.yml has no node matrix')
  assert.strictEqual(
    lowest(versions),
    declared,
    `ci.yml's lowest node is ${lowest(versions)}, but engines.node declares ${declared}`,
  )
})

test('ci.yml does not set registry-url', () => {
  const yaml = fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8')
  assert.strictEqual(setsRegistryUrl(yaml), false)
})

// --- the checks fire --------------------------------------------------------

test('a workflow that really sets registry-url is caught', () => {
  assert.strictEqual(
    setsRegistryUrl('      - uses: actions/setup-node@v4\n        with:\n          registry-url: https://registry.npmjs.org\n'),
    true,
  )
})

test('a drifted matrix floor is caught', () => {
  const yaml = "      matrix:\n        node: ['20', '24']\n"
  assert.notStrictEqual(lowest(matrixNodeVersions(yaml)), '22.13')
})

// --- the checks stay silent -------------------------------------------------

test('a comment mentioning registry-url is not an accusation', () => {
  // The healthy-but-unusual input: ci.yml explains WHY it omits the option, so
  // the string is in the file and the setting is not. A grep-based check would
  // fail the correct file (`.claude/rules/negative-checks.md` rule 3).
  const yaml = '# NOTE: setup-node is used WITHOUT `registry-url` — see release.yml.\n      - uses: actions/setup-node@v4\n'
  assert.strictEqual(setsRegistryUrl(yaml), false)
})

test('an unparseable engines range yields no floor, rather than a wrong one', () => {
  assert.strictEqual(floorOf('^22.13'), null)
  assert.strictEqual(floorOf(''), null)
  assert.strictEqual(floorOf(undefined), null)
})

test('versions sort numerically, not lexically', () => {
  // '9' beats '22.13' under a string sort, which would pick the wrong floor.
  assert.strictEqual(lowest(['24', '22.13']), '22.13')
  assert.strictEqual(lowest(['22.13', '9']), '9')
})
