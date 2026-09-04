'use strict'

/**
 * `spec-sync init-config` — the engine half of `/spec-linear-setup`.
 *
 * The skill gathers over MCP; this validates and writes, so a malformed config
 * is never the model's formatting. What the tests pin is the three properties
 * that make it worth having as a command rather than a template:
 *
 *   - it writes only what the operator set, so the file shows this repo's
 *     choices and keeps picking up changes to the defaults;
 *   - it catches a renamed workflow state at setup rather than at first push,
 *     where Linear's silent no-op makes it look like sync simply stopped;
 *   - it refuses to clobber an existing config, so re-running the skill is a
 *     way to check a setup rather than a way to lose one.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { loadLinearConfig, CONFIG_FILE } = require('../src/config.js')

function repo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-initcfg-'))
}

function capture() {
  const chunks = []
  return { write: (s) => chunks.push(s), text: () => chunks.join('') }
}

async function run(dir, args) {
  const out = capture()
  const code = await specSync(['init-config', '--dir', dir, ...args], { out, err: out, cwd: dir })
  return { code, text: out.text() }
}

function statesFile(dir, names) {
  const file = path.join(dir, 'states.json')
  fs.writeFileSync(file, JSON.stringify(names), 'utf-8')
  return file
}

function written(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8'))
}

test('writes a minimal config from a team id alone', async () => {
  const dir = repo()
  const { code, text } = await run(dir, ['--team-id', 'team-uuid-1'])

  assert.strictEqual(code, 0)
  assert.deepStrictEqual(written(dir), { linear: { teamId: 'team-uuid-1' } })
  assert.match(text, /wrote specs\/\.core\/linear\.config\.json/)
})

test('omits every default the operator did not set', async () => {
  const dir = repo()
  await run(dir, ['--team-id', 'T1'])
  const raw = fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8')

  // The shipped defaults must not be restated: a config that repeats them
  // buries the one line that is this repo's, and freezes today's values.
  for (const key of ['mapping', 'snapshot', 'branch', 'auth', 'apply', 'sync', 'states']) {
    assert.ok(!raw.includes(`"${key}"`), `${key} should not be written`)
  }
  // …and the loader still supplies them.
  const { config, present } = loadLinearConfig(dir)
  assert.strictEqual(present, true)
  assert.strictEqual(config.mapping.phases, 'subissue')
  assert.strictEqual(config.states.complete, 'Done')
  assert.strictEqual(config.sync.baseDir, 'specs/.core/linear-base')
})

test('writes the values the operator did set, and they load back', async () => {
  const dir = repo()
  const { code } = await run(dir, [
    '--team-id', 'T1', '--team-key', 'SKI', '--project-id', 'P9',
    '--intake-label', 'spec', '--bug-labels', 'bug, defect', '--hotfix-labels', 'production',
  ])

  assert.strictEqual(code, 0)
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.linear.teamKey, 'SKI')
  assert.strictEqual(config.linear.projectId, 'P9')
  assert.strictEqual(config.intake.label, 'spec')
  assert.deepStrictEqual(config.intake.bugLabels, ['bug', 'defect'])
  assert.deepStrictEqual(config.intake.hotfixLabels, ['production'])
})

test('a state name missing from the workspace fails, names it, and suggests the replacement', async () => {
  const dir = repo()
  const file = statesFile(dir, ['Backlog', 'In Progress', 'Shipped', 'Cancelled'])
  const { code, text } = await run(dir, ['--team-id', 'T1', '--states', file])

  assert.strictEqual(code, 1)
  assert.ok(!fs.existsSync(path.join(dir, CONFIG_FILE)), 'nothing written on a failed check')
  assert.match(text, /states\.complete: "Done" is not an issue state/)
  assert.match(text, /--state complete="Shipped"/)
  assert.match(text, /available: Backlog, In Progress, Shipped, Cancelled/)
})

test('--state overrides clear the check and write only the renamed buckets', async () => {
  const dir = repo()
  const file = statesFile(dir, ['Backlog', 'In Progress', 'Shipped', 'Cancelled'])
  const { code, text } = await run(dir, [
    '--team-id', 'T1', '--states', file,
    '--state', 'complete=Shipped', '--state', 'cancelled=Cancelled',
  ])

  assert.strictEqual(code, 0)
  // Only the two that differ — `backlog`/`in-progress` still come from defaults.
  assert.deepStrictEqual(written(dir).states, { complete: 'Shipped', cancelled: 'Cancelled' })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.states.backlog, 'Backlog')
  assert.strictEqual(config.states.complete, 'Shipped')
  assert.match(text, /4 checked against 4 workspace state\(s\) — all present/)
})

test('--state on a bucket that is not a lifecycle bucket is refused', async () => {
  const dir = repo()
  const { code, text } = await run(dir, ['--team-id', 'T1', '--state', 'shipped=Done'])

  assert.strictEqual(code, 1)
  assert.match(text, /--state shipped=… is not a lifecycle bucket/)
  assert.ok(!fs.existsSync(path.join(dir, CONFIG_FILE)))
})

test('an existing config is refused without --force, and replaced with it', async () => {
  const dir = repo()
  await run(dir, ['--team-id', 'FIRST'])

  const refused = await run(dir, ['--team-id', 'SECOND'])
  assert.strictEqual(refused.code, 1)
  assert.match(refused.text, /already exists/)
  assert.strictEqual(written(dir).linear.teamId, 'FIRST', 'the existing config is untouched')

  const forced = await run(dir, ['--team-id', 'SECOND', '--force'])
  assert.strictEqual(forced.code, 0)
  assert.strictEqual(written(dir).linear.teamId, 'SECOND')
})

test('--force replaces a config too malformed for the loader to read', async () => {
  // The one case that must not depend on loading first: a broken file is
  // exactly when you reach for setup again.
  const dir = repo()
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), '{ not json', 'utf-8')

  const { code } = await run(dir, ['--team-id', 'T1', '--force'])
  assert.strictEqual(code, 0)
  assert.strictEqual(loadLinearConfig(dir).config.linear.teamId, 'T1')
})

test('--team-id is required', async () => {
  const dir = repo()
  const { code, text } = await run(dir, ['--team-key', 'SKI'])

  assert.strictEqual(code, 1)
  assert.match(text, /--team-id is required/)
  assert.ok(!fs.existsSync(path.join(dir, CONFIG_FILE)))
})

test('an unreadable or non-array --states file is refused rather than skipped', async () => {
  const dir = repo()
  const missing = await run(dir, ['--team-id', 'T1', '--states', path.join(dir, 'nope.json')])
  assert.strictEqual(missing.code, 1)
  assert.match(missing.text, /no such --states file/)

  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, '{"states":[]}', 'utf-8')
  const notArray = await run(dir, ['--team-id', 'T1', '--states', bad])
  assert.strictEqual(notArray.code, 1)
  assert.match(notArray.text, /must be a JSON array/)

  assert.ok(!fs.existsSync(path.join(dir, CONFIG_FILE)), 'a states file we could not check never writes')
})

test('--json emits a machine-readable result the skill can relay', async () => {
  const dir = repo()
  const file = statesFile(dir, ['Backlog', 'In Progress', 'Done', 'Canceled'])
  const { code, text } = await run(dir, ['--team-id', 'T1', '--states', file, '--json'])

  assert.strictEqual(code, 0)
  const result = JSON.parse(text)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.file, CONFIG_FILE)
  assert.strictEqual(result.replaced, false)
  assert.deepStrictEqual(result.wrote, { linear: { teamId: 'T1' } })
  assert.deepStrictEqual(result.validated.states, { checked: 4, against: 4, missing: [] })
})

test('--json reports a failure as data, not as prose', async () => {
  const dir = repo()
  const file = statesFile(dir, ['Backlog', 'In Progress', 'Shipped', 'Canceled'])
  const { code, text } = await run(dir, ['--team-id', 'T1', '--states', file, '--json'])

  assert.strictEqual(code, 1)
  const result = JSON.parse(text)
  assert.strictEqual(result.ok, false)
  assert.deepStrictEqual(result.missing, ['Done'])
})

test('init-config runs when no config exists — every other subcommand bows out', async () => {
  // The chicken-and-egg this command exists to break: `specSync` short-circuits
  // on `present:false`, so setup has to be dispatched ahead of the load.
  const dir = repo()
  const out = capture()
  await specSync(['states', '--dir', dir], { out, err: out, cwd: dir })
  assert.match(out.text(), /Linear sync not enabled/)

  const init = await run(dir, ['--team-id', 'T1'])
  assert.strictEqual(init.code, 0)
})

// --- the deployment ladder --------------------------------------------------

test('--stage writes the ladder in the order given', async () => {
  const dir = repo()
  const r = await run(dir, ['--team-id', 'T1', '--stage', 'test=On Test', '--stage', 'demo=Ready for Demo', '--stage', 'prod=Done'])
  assert.strictEqual(r.code, 0, r.text)
  assert.deepStrictEqual(written(dir).release.stages, [
    { key: 'test', state: 'On Test' },
    { key: 'demo', state: 'Ready for Demo' },
    { key: 'prod', state: 'Done' },
  ])
})

// The STAYS-SILENT case: a setup that names no stages must not gain a ladder.
test('no --stage leaves the ladder out of the file entirely', async () => {
  const dir = repo()
  const r = await run(dir, ['--team-id', 'T1'])
  assert.strictEqual(r.code, 0, r.text)
  assert.ok(!('release' in written(dir)), 'no empty ladder is invented')
})

test('a malformed --stage is refused by the loader, not written', async () => {
  const dir = repo()
  const r = await run(dir, ['--team-id', 'T1', '--stage', 'test='])
  assert.strictEqual(r.code, 1)
  assert.match(r.text, /release\.stages\[0\]\.state/)
  assert.ok(!fs.existsSync(path.join(dir, CONFIG_FILE)), 'nothing written')
})

test('a duplicate --stage key is refused', async () => {
  const dir = repo()
  const r = await run(dir, ['--team-id', 'T1', '--stage', 'test=On Test', '--stage', 'test=Done'])
  assert.strictEqual(r.code, 1)
  assert.match(r.text, /duplicate/)
})

test('a stage name the workspace lacks is refused with the rung named', async () => {
  const dir = repo()
  const r = await run(dir, [
    '--team-id', 'T1',
    '--stage', 'test=On Test',
    '--states', statesFile(dir, ['Backlog', 'In Progress', 'Done', 'Canceled']),
  ])
  assert.strictEqual(r.code, 1)
  assert.match(r.text, /release\.stages\[test\]: "On Test" is not an issue state/)
})

test('a ladder the workspace covers is written', async () => {
  const dir = repo()
  const r = await run(dir, [
    '--team-id', 'T1',
    '--stage', 'prod=Done',
    '--states', statesFile(dir, ['Backlog', 'In Progress', 'Done', 'Canceled']),
  ])
  assert.strictEqual(r.code, 0, r.text)
  assert.deepStrictEqual(written(dir).release.stages, [{ key: 'prod', state: 'Done' }])
  assert.deepStrictEqual(loadLinearConfig(dir).config.release.stages, [{ key: 'prod', state: 'Done' }])
})
