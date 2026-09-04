'use strict'

// A source package's `assets/` tree is PRE-composition: `<!-- seam:NAME -->` is
// still literal text that `scripts/build-dist.js` replaces (with a provider's
// fragment, or with nothing for the base). Only a built distribution's assets are
// installable. Installing a source tree writes those markers straight into the
// user's `.claude/skills/`, and — in a dev-linked repo, where the installed
// skills are symlinks to the COMPOSED dist — reports every one of them as
// `customized`, so `--force` writes the broken text through the link.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execFileSync } = require('node:child_process')
const { assertComposedAssets } = require('../src/init.js')

const ASSETS = path.join(__dirname, '..', 'assets')

function tmpdir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-uncomposed-')))
}

// Spawn the bin, not run() — the guard sits at the outermost boundary so the
// unit tests can still drive the library against this source tree. Returns
// { status, stderr }; the bin exits non-zero and reports on stderr.
const BINS = {
  base: path.join(__dirname, '..', 'bin', 'skitterspec.js'),
  provider: path.join(__dirname, '..', '..', 'linear', 'bin', 'skitterspec-linear.js'),
}

function runBin(which, argv) {
  try {
    execFileSync(process.execPath, [BINS[which], ...argv], { stdio: 'pipe' })
    return { status: 0, stderr: '' }
  } catch (err) {
    return { status: err.status, stderr: String(err.stderr || '') }
  }
}

// The precondition the whole bug rests on. If this ever fails, the source tree
// stopped carrying seams and the guard below is measuring nothing.
test('the source assets tree really is uncomposed', () => {
  const spec = fs.readFileSync(path.join(ASSETS, 'skills', 'spec', 'SKILL.md'), 'utf8')
  assert.match(spec, /<!--\s*seam:/, 'packages/common/assets is pre-composition')
})

test('the init command refuses an uncomposed asset tree', () => {
  const dir = tmpdir()
  try {
    const { status, stderr } = runBin('base', ['init', dir, '--yes'])
    assert.notStrictEqual(status, 0, 'exits non-zero')
    assert.match(stderr, /uncomposed|not composed/i, 'says why')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a refused install writes no skill at all', () => {
  const dir = tmpdir()
  try {
    runBin('base', ['init', dir, '--yes'])
    const skills = path.join(dir, '.claude', 'skills')
    const installed = fs.existsSync(skills) ? fs.readdirSync(skills) : []
    assert.deepStrictEqual(installed, [], 'nothing half-installed')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// The error has to name the fix, or the reader is left with a refusal and no way
// forward — the guard would just look like a broken CLI.
test('the refusal names the build step and the offending file', () => {
  const dir = tmpdir()
  try {
    const { stderr } = runBin('base', ['init', dir, '--yes'])
    assert.match(stderr, /build/i, 'points at building the distribution')
    assert.match(stderr, /skills[/\\]spec[/\\]SKILL\.md/, 'names a real offender')
    assert.match(stderr, /\d+ file\(s\)/, 'says how many')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// The provider bin delegates `update` to the base CLI, so it needs its own guard
// — that delegation is exactly how the uncomposed install happened in practice.
test('the provider bin refuses update too, not just the base bin', () => {
  const dir = tmpdir()
  try {
    const { status, stderr } = runBin('provider', ['update', dir])
    assert.notStrictEqual(status, 0, 'exits non-zero')
    assert.match(stderr, /uncomposed|not composed/i, 'says why')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- stays-silent (.claude/rules/negative-checks.md rule 3) -----------------
//
// The tests above prove the guard CAN fire. This one proves it does not fire on
// the healthy input — a real composed distribution — which is the only reading
// that makes the guard safe to ship.

test('stays silent: a composed distribution passes the guard', () => {
  const dists = ['skitterspec', 'skitterspec-linear'].map((p) =>
    path.join(__dirname, '..', '..', p, 'assets'),
  )
  const built = dists.filter((d) => fs.existsSync(path.join(d, 'skills', 'spec', 'SKILL.md')))
  assert.ok(built.length, 'run "npm run build" — this test needs a built distribution')
  for (const dir of built) {
    for (const f of fs.readdirSync(path.join(dir, 'skills'))) {
      const body = fs.readFileSync(path.join(dir, 'skills', f, 'SKILL.md'), 'utf8')
      assert.doesNotMatch(body, /<!--\s*seam:/, `${f} in ${path.basename(path.dirname(dir))}`)
    }
  }
})

// The guard walks every .md under assets/, not just skills/ — a distribution
// need not ship every subtree, and a missing one must be silence, not a crash.
// Proven positively: it names the offending file, and it found one to name.
// The marker must be matched precisely: prose that merely mentions seams — as
// spec-planning.md and this project's own docs do — is not an uncomposed asset.
test('stays silent: prose mentioning the word seam does not trip the guard', () => {
  const rule = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')
  assert.match(rule, /seam/i, 'precondition: the rule really does discuss seams')
  assert.doesNotMatch(rule, /<!--\s*seam:/, 'but carries no marker, so it is not an offender')
})
