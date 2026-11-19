'use strict'

/**
 * `spec-env review allow`, after the published tier was retired
 * (feat-tailnet-remote-tier).
 *
 * `network` is the one setting left, and it now covers the tailnet `remote`
 * door too. `allow remote` refuses by name rather than quietly doing the
 * network thing, and a config that still says `review.allowRemote` is a repo
 * that has not tidied up — never reported, never refused.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { collectUnknownKeys } = require('../src/env/config.js')

function repo(review) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-allow-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, ...(review ? { review } : {}) }, null, 2) + '\n',
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  g('branch', '-M', 'main')
  return dir
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  const code = process.exitCode
  let exit
  try {
    await run(argv)
  } finally {
    exit = process.exitCode
    process.stdout.write = orig
    process.exitCode = code
  }
  return { out, exit }
}

const configText = (dir) => fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8')
const review = (dir) => JSON.parse(configText(dir)).review || {}

test('allow remote refuses by name, says where it went, and writes nothing', async () => {
  const dir = repo()
  const before = configText(dir)
  const { out, exit } = await runQuiet(['spec-env', 'review', 'allow', 'remote', '--dir', dir])
  assert.match(out, /remote is no longer a setting/)
  assert.match(out, /tailnet address/)
  assert.strictEqual(exit, 1)
  assert.strictEqual(configText(dir), before)
  assert.ok(!fs.existsSync(path.join(dir, '.spec-env')), 'no per-spec sidecar is written')
})

test('an unknown tier is refused by name, and writes nothing', async () => {
  const dir = repo()
  const before = configText(dir)
  const { out, exit } = await runQuiet(['spec-env', 'review', 'allow', 'publish', '--dir', dir])
  assert.match(out, /"publish" is not a tier/)
  assert.strictEqual(exit, 1)
  assert.strictEqual(configText(dir), before)
})

test('allow network --set toggles, and --set on/off are explicit', async () => {
  const dir = repo()
  let r = await runQuiet(['spec-env', 'review', 'allow', 'network', '--set', '', '--dir', dir])
  assert.strictEqual(review(dir).allowNetwork, false, 'network defaults on, so a toggle turns it off')
  assert.match(r.out, /network reviews are now OFF/)
  r = await runQuiet(['spec-env', 'review', 'allow', 'network', '--set', 'on', '--dir', dir])
  assert.strictEqual(review(dir).allowNetwork, true)
  r = await runQuiet(['spec-env', 'review', 'allow', 'network', '--set', 'on', '--dir', dir])
  assert.match(r.out, /\(unchanged\)/)
  r = await runQuiet(['spec-env', 'review', 'allow', 'network', '--off', '--dir', dir])
  assert.strictEqual(review(dir).allowNetwork, false)
})

test('an unknown state is refused by name, and writes nothing', async () => {
  const dir = repo()
  const before = configText(dir)
  const { out, exit } = await runQuiet(['spec-env', 'review', 'allow', 'network', '--set', 'maybe', '--dir', dir])
  assert.match(out, /"maybe" is not a state/)
  assert.strictEqual(exit, 1)
  assert.strictEqual(configText(dir), before)
})

test('STAYS SILENT: a config still setting review.allowRemote is not an unknown key', () => {
  assert.deepStrictEqual(collectUnknownKeys({ review: { allowRemote: true, allowNetwork: true } }), [])
  assert.deepStrictEqual(collectUnknownKeys({ review: { allowRemot: true } }), ['review.allowRemot'], 'a typo still is')
})

test('STAYS SILENT: a config still setting review.allowRemote renders the stack as usual', async () => {
  const dir = repo({ allowRemote: true })
  const { out, exit } = await runQuiet(['spec-env', 'status', '--dir', dir])
  assert.notStrictEqual(exit, 1)
  assert.doesNotMatch(out, /allowRemote/)
})
