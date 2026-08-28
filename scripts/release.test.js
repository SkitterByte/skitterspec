'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { spawnSync } = require('node:child_process')

const {
  PACKAGES,
  TARBALL_INPUTS,
  lastTagFor,
  assertShippableChange,
  resolvePackage,
  readVersion,
  writeVersion,
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

test('writeVersion sets the version in place and preserves formatting', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-release-'))
  const p = path.join(dir, 'package.json')
  // Trailing comment-ish key + specific indentation to prove only the version
  // string changes (no reserialize).
  fs.writeFileSync(p, '{\n  "name": "x",\n  "version": "2.0.0",\n  "type": "commonjs"\n}\n')
  writeVersion(p, '2.0.1')
  assert.strictEqual(readVersion(p), '2.0.1')
  assert.strictEqual(
    fs.readFileSync(p, 'utf8'),
    '{\n  "name": "x",\n  "version": "2.0.1",\n  "type": "commonjs"\n}\n',
  )
  // No matching version field → a clear throw, not a silent no-op.
  fs.writeFileSync(p, '{\n  "name": "x"\n}\n')
  assert.throws(() => writeVersion(p, '2.0.1'), /could not set version/)
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
    'set packages/skitterspec/package.json version → 2.0.1',
    'git add packages/skitterspec/package.json',
    'git commit -m "chore(release): skitterspec@2.0.1"',
    'pnpm publish --filter @skitterbyte/skitterspec --access public --no-git-checks',
    'git tag skitterspec@2.0.1',
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

test('buildPlan steps carry an executable argv; the commit message is one token', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'publish',
  })

  // Every shell step must be executable via a pre-tokenized argv — execute()
  // spawns argv, not a whitespace-split of the pretty cmd string. The bump is a
  // write-version step (an fs write, no shell), so it carries file+version.
  for (const step of plan.steps) {
    if (step.kind === 'write-version') {
      assert.ok(step.file && step.version, `write-version step: ${step.cmd}`)
      continue
    }
    assert.ok(Array.isArray(step.argv) && step.argv.length >= 2, `argv on: ${step.cmd}`)
  }

  // The regression: the commit message contains spaces and must survive as a
  // SINGLE argv token (a naive cmd.split(' ') shattered it into a bad pathspec).
  const commit = plan.steps.find((s) => s.argv && s.argv[0] === 'git' && s.argv[1] === 'commit')
  assert.deepStrictEqual(commit.argv, ['git', 'commit', '-m', 'chore(release): skitterspec@2.0.1'])
})

test('buildPlan for an equal version skips bump/commit and just publishes + tags', () => {
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
    'pnpm publish --filter @skitterbyte/skitterspec --access public --no-git-checks',
    'git tag skitterspec@2.0.0',
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
    allowEmpty: false,
    pkg: 'skitterspec',
    bump: 'patch',
  })
  const pub = parseArgs(['n', 'n', 'skitterspec', '2.0.0', '--publish'])
  assert.strictEqual(pub.publish, true)
  const yes = parseArgs(['n', 'n', 'skitterspec-linear', 'minor', '--yes'])
  assert.strictEqual(yes.yes, true)
  const empty = parseArgs(['n', 'n', 'skitterspec', 'patch', '--yes', '--allow-empty'])
  assert.strictEqual(empty.allowEmpty, true)
})

// PACKAGES is the small, closed registry the rest keys off.
test('PACKAGES holds exactly the two publishable distributions', () => {
  assert.deepStrictEqual(Object.keys(PACKAGES).sort(), ['skitterspec', 'skitterspec-linear'])
})

// A tag cut BEFORE the publish asserts a release npm may not have. `sh` throws on
// a non-zero exit, so a failed `pnpm publish` aborted the run with the tag
// already written — which is how skitterspec@16.3.1 came to be tagged, committed
// and absent from npm, silently superseded by 16.3.2.
test('the tag is cut only after the publish step', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'publish',
  })
  const publishAt = plan.steps.findIndex((s) => s.phase === 'publish')
  const tagAt = plan.steps.findIndex((s) => /^git tag /.test(s.cmd))
  assert.ok(publishAt !== -1 && tagAt !== -1, 'both steps present')
  assert.ok(publishAt < tagAt, 'publish must precede the tag')
})

// ...but the tag is still a LOCAL step, so `--yes` without `--publish` — the
// "I prep, you publish" half — keeps tagging as it always did.
test('the tag stays a local step, and stays last', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'publish',
  })
  const tagStep = plan.steps[plan.steps.length - 1]
  assert.match(tagStep.cmd, /^git tag /, 'the tag is the last step')
  assert.strictEqual(tagStep.phase, 'local', 'and still runs without --publish')
})

// --- nothing to ship --------------------------------------------------------
//
// skitterspec-linear@9.1.0 was a release in which nothing shipped: across every
// input to its tarball the only change was the version string. A consumer had to
// unpack both published tarballs to discover that, twice. A minor bump is meant
// to signal new functionality.

test('TARBALL_INPUTS covers every publishable package', () => {
  // A third distribution must not be addable without declaring what it ships.
  assert.deepStrictEqual(Object.keys(TARBALL_INPUTS).sort(), Object.keys(PACKAGES).sort())
})

test('TARBALL_INPUTS names source packages, never the generated dist dirs', () => {
  // packages/<dist>/{src,assets,bin} are gitignored and composed at prepack, so a
  // diff over them is empty for EVERY release — gating on them would read every
  // release as empty.
  for (const paths of Object.values(TARBALL_INPUTS)) {
    for (const p of paths) {
      assert.ok(!/\/(src|assets|bin)$/.test(p), `${p} is a generated dir, not a git-visible input`)
    }
  }
  assert.ok(TARBALL_INPUTS.skitterspec.includes('packages/common'), 'base composes from common')
  assert.ok(TARBALL_INPUTS['skitterspec-linear'].includes('packages/sync-core'), 'linear vendors the engine')
})

test('lastTagFor picks the highest version, not the last listed', () => {
  const tags = [
    'skitterspec@9.0.0',
    'skitterspec@10.0.0',
    'skitterspec@2.0.1',
    'skitterspec-linear@10.0.1',
    'v1.0.0',
  ]
  assert.strictEqual(lastTagFor('skitterspec', tags), 'skitterspec@10.0.0')
  assert.strictEqual(lastTagFor('skitterspec-linear', tags), 'skitterspec-linear@10.0.1')
  assert.strictEqual(lastTagFor('skitterspec', []), null, 'never released → null')
})

test('assertShippableChange refuses a release with no changed input', () => {
  assert.throws(
    () => assertShippableChange([], { name: 'skitterspec-linear', sinceTag: 'skitterspec-linear@9.0.0' }),
    /nothing to ship/,
  )
  assert.throws(
    () => assertShippableChange([], { name: 'skitterspec-linear', sinceTag: 'skitterspec-linear@9.0.0' }),
    /--allow-empty/,
    'points at the escape hatch',
  )
})

test('assertShippableChange allows a real change, a first release, or an explicit opt-in', () => {
  assert.doesNotThrow(() =>
    assertShippableChange(['packages/common/src/init.js'], { name: 'skitterspec', sinceTag: 'skitterspec@16.3.0' }),
  )
  assert.doesNotThrow(
    () => assertShippableChange([], { name: 'skitterspec', sinceTag: null }),
    'a package with no prior tag has nothing to be identical to',
  )
  assert.doesNotThrow(() =>
    assertShippableChange([], { name: 'skitterspec', sinceTag: 'skitterspec@16.3.0', allowEmpty: true }),
  )
})

// The two real releases from the field report, measured against this repo's own
// history — the second is the control that proves the guard does not over-fire.
test('the guard separates the real empty release from the substantive one', () => {
  const root = path.join(__dirname, '..')
  const has = (t) => spawnSync('git', ['rev-parse', '--verify', t], { cwd: root, encoding: 'utf8' }).status === 0

  if (has('skitterspec-linear@9.0.0') && has('skitterspec-linear@9.1.0')) {
    const changed = spawnSync(
      'git',
      ['diff', '--name-only', 'skitterspec-linear@9.0.0', 'skitterspec-linear@9.1.0', '--', ...TARBALL_INPUTS['skitterspec-linear']],
      { cwd: root, encoding: 'utf8' },
    ).stdout.split('\n').filter(Boolean)
      .filter((f) => f !== 'packages/skitterspec-linear/package.json')
    assert.deepStrictEqual(changed, [], '9.1.0 shipped nothing but a version string')
  }

  if (has('skitterspec@16.3.0') && has('skitterspec@16.3.2')) {
    const changed = spawnSync(
      'git',
      ['diff', '--name-only', 'skitterspec@16.3.0', 'skitterspec@16.3.2', '--', ...TARBALL_INPUTS.skitterspec],
      { cwd: root, encoding: 'utf8' },
    ).stdout.split('\n').filter(Boolean)
      .filter((f) => f !== 'packages/skitterspec/package.json')
    assert.ok(changed.length, 'the 16.3.x line did ship content — the guard must not block it')
  }
})
