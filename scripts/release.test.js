'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const {
  PACKAGES,
  resolvePackage,
  readVersion,
  computeNextVersion,
  cmpSemver,
  tagName,
  buildPlan,
  assertCleanTree,
  assertTagAvailable,
  formatPlan,
  parseArgs,
} = require('./release.js')

const ROOT = path.join(__dirname, '..')

// --- package resolution -----------------------------------------------------

test('resolvePackage maps the two publishable dists to dir + npm name', () => {
  const base = resolvePackage('skitterspec', ROOT)
  assert.strictEqual(base.npm, '@skitterbyte/skitterspec')
  assert.strictEqual(base.dirRel, 'packages/skitterspec')
  assert.ok(base.pkgJsonPath.endsWith(path.join('packages', 'skitterspec', 'package.json')))

  const lin = resolvePackage('skitterspec-linear', ROOT)
  assert.strictEqual(lin.npm, '@skitterbyte/skitterspec-linear')
  assert.strictEqual(lin.dirRel, 'packages/skitterspec-linear')
})

test('resolvePackage refuses an unknown package, listing the valid ones', () => {
  assert.throws(() => resolvePackage('common'), /unknown package "common".*skitterspec/s)
  assert.throws(() => resolvePackage('skitterspec-monorepo'), /valid: /)
})

test('readVersion reads the real published packages (currently 2.0.0 / 1.0.0)', () => {
  // These are the live source versions; the test proves the reader works against
  // the actual package.json shape, not a fixture.
  assert.match(readVersion(resolvePackage('skitterspec', ROOT).pkgJsonPath), /^\d+\.\d+\.\d+$/)
  assert.match(readVersion(resolvePackage('skitterspec-linear', ROOT).pkgJsonPath), /^\d+\.\d+\.\d+$/)
})

// --- version computation ----------------------------------------------------

test('computeNextVersion bumps patch/minor/major', () => {
  assert.strictEqual(computeNextVersion('2.0.0', 'patch'), '2.0.1')
  assert.strictEqual(computeNextVersion('2.0.0', 'minor'), '2.1.0')
  assert.strictEqual(computeNextVersion('2.3.4', 'minor'), '2.4.0')
  assert.strictEqual(computeNextVersion('2.3.4', 'major'), '3.0.0')
})

test('computeNextVersion accepts an explicit target >= current (incl. equal)', () => {
  assert.strictEqual(computeNextVersion('2.0.0', '2.5.0'), '2.5.0')
  // equal is allowed — first release of a version already in package.json
  assert.strictEqual(computeNextVersion('2.0.0', '2.0.0'), '2.0.0')
})

test('computeNextVersion rejects a downgrade and an invalid target', () => {
  assert.throws(() => computeNextVersion('2.0.0', '1.9.9'), /downgrade/)
  assert.throws(() => computeNextVersion('2.0.0', 'nope'), /invalid bump\/version/)
  assert.throws(() => computeNextVersion('2.0.0', '2.0'), /invalid bump\/version/)
})

test('cmpSemver orders correctly', () => {
  assert.strictEqual(cmpSemver('2.0.0', '2.0.1'), -1)
  assert.strictEqual(cmpSemver('2.1.0', '2.0.9'), 1)
  assert.strictEqual(cmpSemver('2.0.0', '2.0.0'), 0)
})

// --- tag + plan shape -------------------------------------------------------

test('tagName uses the short name@version scheme', () => {
  assert.strictEqual(tagName('skitterspec', '2.0.1'), 'skitterspec@2.0.1')
  assert.strictEqual(tagName('skitterspec-linear', '1.0.0'), 'skitterspec-linear@1.0.0')
})

test('buildPlan for a bump emits ordered local steps then publish, and never pushes', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'publish',
  })

  assert.strictEqual(plan.tag, 'skitterspec@2.0.1')
  assert.strictEqual(plan.needsBump, true)

  const cmds = plan.steps.map((s) => s.cmd)
  assert.deepStrictEqual(cmds, [
    'npm version 2.0.1 --no-git-tag-version -w @skitterbyte/skitterspec',
    'git add packages/skitterspec/package.json package-lock.json',
    'git commit -m "chore(release): skitterspec@2.0.1"',
    'git tag skitterspec@2.0.1',
    'npm publish -w @skitterbyte/skitterspec --access public',
  ])

  // the publish step is the only one gated behind the publish level
  const publishSteps = plan.steps.filter((s) => s.phase === 'publish')
  assert.strictEqual(publishSteps.length, 1)
  assert.match(publishSteps[0].cmd, /--access public/)

  // no push in the executed steps — only in the manual follow-up
  assert.ok(!plan.steps.some((s) => /git push/.test(s.cmd)), 'no git push in steps')
  assert.ok(plan.followUp.some((c) => c === 'git push'), 'git push is a follow-up')
  assert.ok(plan.followUp.some((c) => c === 'git push origin skitterspec@2.0.1'))
})

test('buildPlan for an equal version skips bump/commit and just tags + publishes', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.0',
    level: 'publish',
  })
  assert.strictEqual(plan.needsBump, false)
  const cmds = plan.steps.map((s) => s.cmd)
  assert.deepStrictEqual(cmds, [
    'git tag skitterspec@2.0.0',
    'npm publish -w @skitterbyte/skitterspec --access public',
  ])
})

// --- guards -----------------------------------------------------------------

test('assertCleanTree passes on an empty tree, throws on a dirty one', () => {
  assert.doesNotThrow(() => assertCleanTree(''))
  assert.doesNotThrow(() => assertCleanTree('   \n'))
  assert.throws(() => assertCleanTree(' M packages/skitterspec/package.json\n'), /dirty/)
})

test('assertTagAvailable throws when the tag already exists', () => {
  const tags = ['v1.0.1', 'skitterspec@2.0.0']
  assert.doesNotThrow(() => assertTagAvailable('skitterspec@2.0.1', tags))
  assert.throws(() => assertTagAvailable('skitterspec@2.0.0', tags), /already exists/)
})

// --- formatting + arg parsing ----------------------------------------------

test('formatPlan shows the tag and the never-run push commands', () => {
  const plan = buildPlan({
    name: 'skitterspec-linear',
    npm: '@skitterbyte/skitterspec-linear',
    dirRel: 'packages/skitterspec-linear',
    currentVersion: '1.0.0',
    nextVersion: '1.1.0',
    level: 'plan',
  })
  const out = formatPlan(plan)
  assert.match(out, /skitterspec-linear@1\.1\.0/)
  assert.match(out, /never run by this tool/)
  assert.match(out, /git push/)
})

test('parseArgs derives package, bump, and the escalating level flags', () => {
  assert.deepStrictEqual(parseArgs(['n', 'n', 'skitterspec', 'patch']), {
    help: false,
    publish: false,
    yes: false,
    pkg: 'skitterspec',
    bump: 'patch',
  })
  const pub = parseArgs(['n', 'n', 'skitterspec', '2.0.0', '--publish'])
  assert.strictEqual(pub.publish, true)
  const yes = parseArgs(['n', 'n', 'skitterspec-linear', 'minor', '--yes'])
  assert.strictEqual(yes.yes, true)
})

// PACKAGES is the small, closed registry the rest keys off.
test('PACKAGES holds exactly the two publishable distributions', () => {
  assert.deepStrictEqual(Object.keys(PACKAGES).sort(), ['skitterspec', 'skitterspec-linear'])
})
