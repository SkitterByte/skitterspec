'use strict'

// `--force` means "overwrite the file I told you to overwrite". It does NOT mean
// "follow a symlink out of the install and overwrite whatever is on the other
// end" — but that is what `writeFileSync` does, because it resolves links.
//
// In a checkout that dogfoods its own assets, the other end is
// `packages/*/assets` — the SOURCE. So a `--force` reached for because a skill
// looked stale would write composed content, seams already resolved, into the
// file the link exists to keep live: the asset, the git-tracked one, corrupted in
// place with no copy anywhere. That is a strictly worse outcome than the
// staleness it was reached for, which is why this refuses instead of repairing.
//
// The refusal is narrow by construction and cannot fire in an ordinary consumer
// install — nothing there is linked — and the last test here pins exactly that,
// because a guard that fires on healthy installs gets deleted rather than fixed.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, lastReport, SKILLS, RULES } = require('../src/init.js')

async function initQuiet(opts) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    await init(opts)
  } finally {
    process.stdout.write = orig
  }
}

const tmpProject = () => fs.mkdtempSync(path.join(os.tmpdir(), 'force-symlink-'))
const base = { claudeMd: false, mode: 'init' }

// One installed path to experiment on, named the way the installer names it.
const someSkill = () => SKILLS[0]
const skillPath = (dir) => path.join(dir, '.claude', 'skills', someSkill(), 'SKILL.md')

test('--force refuses a live symlink, and the target keeps its content', async () => {
  const dir = tmpProject()
  try {
    await initQuiet({ dir, force: false, ...base })

    // Stand in for the dogfood shape: the installed path is a link to an "asset"
    // living outside the install, exactly as `.claude/skills/<name>` is.
    const asset = path.join(dir, 'asset-source.md')
    const ORIGINAL = '# the source asset\nwith a seam marker the build would fill\n'
    fs.writeFileSync(asset, ORIGINAL)
    const installed = skillPath(dir)
    fs.rmSync(installed)
    fs.symlinkSync(asset, installed)

    await initQuiet({ dir, force: true, ...base, mode: 'update' })

    // THE assertion: not the exit code, not the report — the bytes that did not
    // get written. Everything else here could pass while the asset was clobbered.
    assert.strictEqual(fs.readFileSync(asset, 'utf8'), ORIGINAL, 'the asset was written through')
    assert.ok(fs.lstatSync(installed).isSymbolicLink(), 'the link itself survived')

    const rel = path.relative(dir, installed)
    assert.ok(
      lastReport().refused.includes(rel),
      `expected ${rel} among refused, got ${JSON.stringify(lastReport().refused)}`,
    )
    // Its own bucket, not folded into `unchanged` — "you edited this" and
    // "writing this would corrupt the asset" are different facts, and a reader
    // who cannot tell them apart reaches for a bigger hammer.
    assert.ok(!lastReport().skipped.includes(rel), 'refused must not be reported as unchanged')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a dangling symlink is still repaired, force or not', async () => {
  // The pre-existing branch, and it must survive untouched: a broken link is
  // invisible to existsSync, so without the repair a plain write throws ENOENT.
  for (const force of [false, true]) {
    const dir = tmpProject()
    try {
      await initQuiet({ dir, force: false, ...base })
      const installed = skillPath(dir)
      fs.rmSync(installed)
      fs.symlinkSync(path.join(dir, 'no-such-asset.md'), installed)

      await initQuiet({ dir, force, ...base, mode: 'update' })

      assert.ok(!fs.lstatSync(installed).isSymbolicLink(), `force=${force}: broken link was dropped`)
      assert.ok(fs.readFileSync(installed, 'utf8').length > 0, `force=${force}: a real file replaced it`)
      assert.deepStrictEqual(lastReport().refused, [], `force=${force}: a dangling link is not a refusal`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('--force still overwrites an ordinary edited file', async () => {
  // The refusal must not have quietly disarmed --force for everyone else.
  const dir = tmpProject()
  try {
    await initQuiet({ dir, force: false, ...base })
    const installed = skillPath(dir)
    fs.writeFileSync(installed, '# locally hacked\n')

    await initQuiet({ dir, force: true, ...base, mode: 'update' })

    const after = fs.readFileSync(installed, 'utf8')
    assert.ok(!after.includes('locally hacked'), '--force overwrote the edit, as it should')
    assert.deepStrictEqual(lastReport().refused, [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('without --force a linked target is skipped, exactly as before', async () => {
  const dir = tmpProject()
  try {
    await initQuiet({ dir, force: false, ...base })
    const asset = path.join(dir, 'asset-source.md')
    fs.writeFileSync(asset, '# source\n')
    const installed = skillPath(dir)
    fs.rmSync(installed)
    fs.symlinkSync(asset, installed)

    await initQuiet({ dir, force: false, ...base, mode: 'update' })

    const rel = path.relative(dir, installed)
    assert.deepStrictEqual(lastReport().refused, [], 'no --force, no refusal — nothing was going to be written')
    assert.ok(lastReport().skipped.includes(rel), 'it is an ordinary skip')
    assert.strictEqual(fs.readFileSync(asset, 'utf8'), '# source\n')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). This is the shape
// every real consumer has, and the refusal must be invisible to all of them —
// including on the `--force` run that is the whole point of the feature.
test('an ordinary consumer install reports zero refusals, even with --force', async () => {
  const dir = tmpProject()
  try {
    await initQuiet({ dir, force: false, ...base })
    // Nothing linked, which is the consumer shape: `skitterspec update` writes
    // copies by design, so there is no link for --force to follow.
    await initQuiet({ dir, force: true, ...base, mode: 'update' })

    assert.deepStrictEqual(lastReport().refused, [])
    // And prove the run did something, so this is not passing on an empty set.
    assert.ok(SKILLS.length > 5 && RULES.length > 0, 'the installer has assets to write')
    const installed = lastReport()
    assert.ok(
      installed.skipped.length + installed.updated.length > 5,
      'the forced run visited the installed files',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
