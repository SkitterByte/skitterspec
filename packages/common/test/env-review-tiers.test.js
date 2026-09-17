'use strict'

/**
 * The review tiers: which surfaces a project permits, and what turns them on.
 *
 * They exist because the engine CANNOT KNOW where the reader is sitting and
 * kept being asked to guess. Three separate incidents in one day: detection
 * said `unknown` on a local session and produced a page whose buttons cannot
 * POST; it said `remote` and produced a LAN URL a phone off the network could
 * not reach; and it flipped mid-session, changing the address underneath a
 * reader. Each was fixed on its own — so the fix here is to stop guessing.
 *
 * Most of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3): two new settings decide a BIND and a PUBLISH, and being wrong about
 * either is expensive in a way a wrong render is not.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { DEFAULT_CONFIG, loadEnvConfig } = require('../src/env/config.js')
const { run } = require('../src/cli.js')

function repo(review = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-tiers-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review }, null, 2) + '\n',
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
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
    process.exitCode = code
  }
  return out
}

const cfg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'))
const allow = (dir, ...extra) => runQuiet(['spec-env', 'review', 'allow', ...extra, '--dir', dir])

// --- the settings -----------------------------------------------------------

test('the defaults are network on, remote off', () => {
  // Network on matches what the engine already did; remote off because a
  // publish is permanent and must never happen unasked.
  assert.strictEqual(DEFAULT_CONFIG.review.allowNetwork, true)
  assert.strictEqual(DEFAULT_CONFIG.review.allowRemote, false)
})

test('STAYS SILENT: a project with neither key gets the defaults', () => {
  const dir = repo()
  try {
    const { config } = loadEnvConfig(dir)
    assert.strictEqual(config.review.allowNetwork, true)
    assert.strictEqual(config.review.allowRemote, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: a non-boolean leaves the default standing', () => {
  // A typo must not quietly widen a bind or permit a publish, which is the same
  // shape `serve` and `required` already follow.
  const dir = repo({ allowNetwork: 'no', allowRemote: 'yes' })
  try {
    const { config } = loadEnvConfig(dir)
    assert.strictEqual(config.review.allowNetwork, true, 'a string is not a refusal')
    assert.strictEqual(config.review.allowRemote, false, 'a string is not a permission')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the bind follows the setting, not the reader ---------------------------

test('the bind reads allowNetwork and not the reader', () => {
  const src = fs.readFileSync(require.resolve('../src/cli.js'), 'utf8')
  assert.match(src, /const host = config\.review\.allowNetwork \? '0\.0\.0\.0' : '127\.0\.0\.1'/)
  // And the old form is gone, not merely unused — reintroducing the guess must
  // fail rather than quietly satisfy a regex that only checks what is present.
  assert.doesNotMatch(src, /const host = reader\.reader === 'remote'/)
})

// --- the allow verb ---------------------------------------------------------

test('allow network --off writes the key, and back on again', async () => {
  const dir = repo()
  try {
    await allow(dir, 'network', '--off')
    assert.strictEqual(cfg(dir).review.allowNetwork, false)
    await allow(dir, 'network')
    assert.strictEqual(cfg(dir).review.allowNetwork, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('allow remote permits publishing, and publishes nothing', async () => {
  const dir = repo()
  try {
    const out = await allow(dir, 'remote')
    assert.strictEqual(cfg(dir).review.allowRemote, true)
    assert.match(out, /PERMITS publishing; it publishes nothing/)
    assert.match(out, /cannot be\n\s*deleted by skitterspec/)
    assert.match(out, /needs \/spec-reviewed/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('it names the absolute path it wrote, and says that tree goes dirty', async () => {
  // Run from a worktree, `dir` is the PRIMARY checkout — so a path relative to
  // `dir` reads as the tree you are standing in and is wrong. Found by running
  // it from a worktree and having to revert the surprise.
  const dir = repo()
  try {
    const out = await allow(dir, 'network', '--off')
    assert.ok(out.includes(path.join(dir, 'specs', '.core', 'env.config.json')), 'absolute path')
    assert.match(out, /that is the primary checkout, whichever tree you ran this from/)
    assert.match(out, /COMMITTED/)
    assert.match(out, /leaves that tree dirty/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('it touches nothing else in the config', async () => {
  const dir = repo({ servePort: 7777 })
  try {
    const before = cfg(dir)
    await allow(dir, 'remote')
    const after = cfg(dir)
    assert.strictEqual(after.baseBranch, before.baseBranch)
    assert.deepStrictEqual(after.docker, before.docker)
    assert.strictEqual(after.review.servePort, 7777, 'a sibling review key survives')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown tier is refused by name, and writes nothing', async () => {
  const dir = repo()
  try {
    const before = fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8')
    const out = await allow(dir, 'lan')
    assert.match(out, /"lan" is not a tier/)
    assert.match(out, /Nothing changed/)
    assert.strictEqual(
      fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'),
      before,
      'byte-identical',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a config it cannot parse is left alone rather than overwritten', async () => {
  // Cannot tell what is in there, so write nothing (rule 4). The refusal comes
  // from `loadEnvConfig`, which rejects the whole `spec-env` command before the
  // verb runs and names the parse position — stronger than the verb's own
  // re-read guard, which covers only a file changed mid-run. Asserted here
  // because the OUTCOME is what matters: the unreadable file survives.
  const dir = repo()
  const file = path.join(dir, 'specs', '.core', 'env.config.json')
  try {
    fs.writeFileSync(file, '{ "review": { oops }\n')
    await assert.rejects(
      () => allow(dir, 'network', '--off'),
      /Invalid specs\/\.core\/env\.config\.json/,
      'the command refuses, naming the file',
    )
    assert.match(fs.readFileSync(file, 'utf8'), /oops/, 'and the file is untouched')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('setting a tier to what it already is says so rather than pretending to change it', async () => {
  const dir = repo({ allowRemote: true })
  try {
    const out = await allow(dir, 'remote')
    assert.match(out, /\(unchanged\)/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
