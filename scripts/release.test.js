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
  verifyFailureMessage,
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

test('buildPlan for a bump emits ordered local steps, and never publishes or pushes', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'local',
  })

  assert.strictEqual(plan.tag, 'skitterspec@2.0.1')
  assert.strictEqual(plan.needsBump, true)

  const cmds = plan.steps.map((s) => s.cmd)
  assert.deepStrictEqual(cmds, [
    'set packages/skitterspec/package.json version → 2.0.1',
    'node scripts/release-notes.js skitterspec 2.0.1',
    'pnpm test',
    'git add packages/skitterspec/package.json RELEASES-skitterspec.md',
    'git commit -m "chore(release): skitterspec@2.0.1"',
    'git tag -a skitterspec@2.0.1 -m "skitterspec 2.0.1"',
  ])

  // CI is the only publisher now, so no step reaches the registry at all.
  assert.deepStrictEqual(plan.steps.filter((s) => s.phase === 'publish'), [])
  assert.ok(!plan.steps.some((s) => /publish/.test(s.cmd)), 'no step publishes')

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
    level: 'local',
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

test('buildPlan for an equal version skips bump/commit and just tags', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.0',
    level: 'local',
  })
  assert.strictEqual(plan.needsBump, false)
  const cmds = plan.steps.map((s) => s.cmd)
  assert.deepStrictEqual(cmds, ['pnpm test', 'git tag -a skitterspec@2.0.0 -m "skitterspec 2.0.0"'])
})

// --- the suite step ---------------------------------------------------------

const plan201 = (extra = {}) =>
  buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'local',
    ...extra,
  })

/**
 * The ordering IS the feature, and the intuitive order is the broken one.
 *
 * "Run the tests before you bump" leaves every guard that reads the version
 * being released out of scope: migration-guide.test.js compares MIGRATION.md
 * against each dist's package.json, so a major with no migration entry is green
 * on every pre-bump run and red the instant the bump lands. skitterspec@20.0.0
 * and skitterspec-linear@14.0.0 were both cut that way.
 *
 * So this pins both sides: after the version is on disk, before anything is
 * staged. A future refactor that "tidies" the suite up to the front of the plan
 * fails here rather than at the next major.
 */
test('the suite runs after the version is written and before anything is staged', () => {
  const steps = plan201().steps
  const at = (pred) => steps.findIndex(pred)

  const write = at((s) => s.kind === 'write-version')
  const notes = at((s) => /release-notes\.js/.test(s.cmd))
  const verify = at((s) => s.kind === 'verify')
  const stage = at((s) => /^git add /.test(s.cmd))
  const commit = at((s) => /^git commit /.test(s.cmd))
  const tag = at((s) => /^git tag /.test(s.cmd))

  assert.ok(verify > write, 'the suite runs with the new version on disk')
  assert.ok(verify > notes, 'the suite sees the generated release notes')
  assert.ok(verify < stage, 'nothing is staged before the suite has passed')
  assert.ok(verify < commit && verify < tag, 'no commit or tag precedes the suite')
})

test('the suite still runs when there is no bump to make', () => {
  // A version-alignment run cuts a tag, and a tag is the release trigger. The
  // absence of a bump is not a reason to ship unverified.
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.0',
    level: 'local',
  })
  const verify = plan.steps.find((s) => s.kind === 'verify')
  assert.ok(verify, 'a no-bump plan still verifies')
  assert.deepStrictEqual(verify.restore, [], 'nothing was written, so nothing to restore')
})

test('--skip-tests drops the suite step and moves nothing else', () => {
  const withTests = plan201().steps.map((s) => s.cmd)
  const skipped = plan201({ skipTests: true })

  assert.ok(!skipped.steps.some((s) => s.kind === 'verify'), 'no suite step')
  assert.deepStrictEqual(
    skipped.steps.map((s) => s.cmd),
    withTests.filter((c) => c !== 'pnpm test'),
    'the remaining steps keep their order',
  )
  // The escape hatch is on the record in the printed plan, like --allow-empty.
  assert.match(formatPlan(skipped), /--skip-tests/)
  assert.ok(!/--skip-tests/.test(formatPlan(plan201())), 'silent when not skipped')
})

/**
 * A red suite is an accusation with a side effect: this tool has already
 * written two files. Telling someone to "fix it and re-run" is not actionable
 * on its own, because the next run refuses on a dirty tree — so the message
 * names the paths.
 *
 * The stays-silent half is the second assertion: where nothing was written,
 * it must not hand out a `git checkout --` with no paths after it.
 */
test('a failed suite names exactly what it wrote, and invents nothing', () => {
  const afterBump = plan201().steps.find((s) => s.kind === 'verify')
  const msg = verifyFailureMessage(afterBump)
  assert.match(msg, /nothing was staged, committed or tagged/)
  assert.match(msg, /git checkout -- packages\/skitterspec\/package\.json RELEASES-skitterspec\.md/)

  const noBump = { cmd: 'pnpm test', restore: [] }
  const quiet = verifyFailureMessage(noBump)
  assert.ok(!/git checkout/.test(quiet), 'no restore command when nothing was written')
  assert.match(quiet, /Fix the failures, then re-run/)
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
    yes: false,
    allowEmpty: false,
    skipTests: false,
    pkg: 'skitterspec',
    bump: 'patch',
  })
  // --publish is gone: it is not a flag that does nothing, it is not a flag.
  assert.ok(!('publish' in parseArgs(['n', 'n', 'skitterspec', '2.0.0', '--publish'])))
  const yes = parseArgs(['n', 'n', 'skitterspec-linear', 'minor', '--yes'])
  assert.strictEqual(yes.yes, true)
  const empty = parseArgs(['n', 'n', 'skitterspec', 'patch', '--yes', '--allow-empty'])
  assert.strictEqual(empty.allowEmpty, true)
  const skip = parseArgs(['n', 'n', 'skitterspec', 'patch', '--yes', '--skip-tests'])
  assert.strictEqual(skip.skipTests, true)
})

// PACKAGES is the small, closed registry the rest keys off.
test('PACKAGES holds exactly the two publishable distributions', () => {
  assert.deepStrictEqual(Object.keys(PACKAGES).sort(), ['skitterspec', 'skitterspec-linear'])
})

// A tag cut BEFORE the publish asserts a release npm may not have. `sh` throws on
// a non-zero exit, so a failed `pnpm publish` aborted the run with the tag
// already written — which is how skitterspec@16.3.1 came to be tagged, committed
// and absent from npm, silently superseded by 16.3.2.
test('the tag is the last step, because it is now the trigger', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'local',
  })
  // This tool used to publish BEFORE tagging, so a failed publish could not
  // leave a tag asserting a release npm did not have (skitterspec@16.3.1).
  // Staging inverts the trade: pushing the tag is what stages, nothing is
  // consumed on npm until a human approves, and a tag whose staging failed
  // costs a delete and a re-push. So the tag goes last and nothing publishes.
  const tagAt = plan.steps.findIndex((s) => /^git tag /.test(s.cmd))
  assert.strictEqual(tagAt, plan.steps.length - 1, 'the tag is the final step')
  assert.deepStrictEqual(plan.steps.filter((s) => s.phase === 'publish'), [])
})

// ...and the tag is still a LOCAL step, so `--yes` tags exactly as it always
// did. Pushing it is the operator's, and is what sets the release off.
test('the tag stays a local step, and stays last', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'local',
  })
  const tagStep = plan.steps[plan.steps.length - 1]
  assert.match(tagStep.cmd, /^git tag /, 'the tag is the last step')
  assert.strictEqual(tagStep.phase, 'local', 'the tag is cut locally, as ever')
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

// --- the tag must be annotated ----------------------------------------------
//
// `git tag <name>` makes a LIGHTWEIGHT tag: a bare ref with no tag object. It
// looks identical in `git tag --list`, and that is the problem — every ordinary
// way of pushing tags alongside a branch skips it in silence.
//
// `git push --follow-tags` sends annotated tags reachable from the commits and
// nothing else, so a lightweight release tag stays local while the push reports
// success. Seven tags for published versions accumulated that way across five
// releases, found only when someone asked whether their push alias sent tags.
//
// An annotated tag also records who cut the release and when, which a tag
// asserting "this version reached npm" ought to carry.

const tagStep = (plan) => plan.steps.find((s) => /^git tag /.test(s.cmd))

const planFor = (level = 'publish') =>
  buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level,
  })

test('the release tag is annotated, so --follow-tags will send it', () => {
  const step = tagStep(planFor())
  assert.ok(step, 'there is a tag step')
  assert.ok(
    step.argv.includes('-a'),
    `tag step is lightweight: ${step.argv.join(' ')} — --follow-tags would skip it`,
  )
  assert.ok(step.argv.includes('-m'), 'an annotated tag needs a message')
})

test('the tag message names the release, not just the tag', () => {
  const step = tagStep(planFor())
  const msg = step.argv[step.argv.indexOf('-m') + 1]
  assert.match(msg, /skitterspec/, 'names the package')
  assert.match(msg, /2\.0\.1/, 'names the version')
})

// The printed command and the argv are two representations of one step; a reader
// copying the printed form must get the same tag the tool would create.
test('the printed tag command matches the argv it would run', () => {
  const step = tagStep(planFor())
  assert.match(step.cmd, /^git tag -a /, `printed form is stale: ${step.cmd}`)
  assert.ok(step.cmd.includes('skitterspec@2.0.1'), 'printed form names the tag')
})

// Local-only runs tag too, so the annotation must not be conditional on publish.
test('a --yes run cuts the same annotated tag', () => {
  const step = tagStep(planFor('yes'))
  assert.ok(step, 'the local run still tags')
  assert.ok(step.argv.includes('-a'), 'and it is annotated there too')
})

// --- release notes ordering --------------------------------------------------
//
// The notes are generated BEFORE the stage and commit, so the file lands in the
// release commit itself. Publishing a version whose notes were never committed
// is the failure this ordering prevents: the version ships and the record does
// not, and nothing about the published package reveals the gap.

test('release notes are written, staged and committed before the tag', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.1',
    level: 'local',
  })
  const at = (re) => plan.steps.findIndex((s) => re.test(s.cmd))
  const notes = at(/release-notes\.js/)
  const stage = at(/^git add /)
  const commit = at(/^git commit /)
  const tag = at(/^git tag /)

  assert.ok(notes >= 0, 'a notes step exists')
  assert.ok(notes < stage, 'notes are written before staging')
  assert.ok(stage < commit, 'staged before committing')
  // The tag is what CI releases from, so the notes must already be in the
  // commit it points at — a release whose record is not in the tagged tree.
  assert.ok(commit < tag, 'committed before the tag it releases from')
})

test('the stage step includes the notes file, not just package.json', () => {
  const plan = buildPlan({
    name: 'skitterspec-linear',
    npm: '@skitterbyte/skitterspec-linear',
    dirRel: 'packages/skitterspec-linear',
    currentVersion: '1.0.0',
    nextVersion: '1.1.0',
    level: 'yes',
  })
  const stage = plan.steps.find((s) => /^git add /.test(s.cmd))
  assert.match(stage.cmd, /RELEASES-skitterspec-linear\.md/, 'the notes file is staged')
  assert.ok(stage.argv.includes('RELEASES-skitterspec-linear.md'), 'and in the argv')
})

// An equal-version release skips the bump and commit entirely, so there is
// nothing to attach notes to — the step must not appear and claim otherwise.
test('an equal-version release emits no notes step', () => {
  const plan = buildPlan({
    name: 'skitterspec',
    npm: '@skitterbyte/skitterspec',
    dirRel: 'packages/skitterspec',
    currentVersion: '2.0.0',
    nextVersion: '2.0.0',
    level: 'publish',
  })
  assert.strictEqual(plan.needsBump, false)
  assert.ok(!plan.steps.some((s) => /release-notes\.js/.test(s.cmd)), 'no notes step')
})

