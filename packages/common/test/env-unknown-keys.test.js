'use strict'

/**
 * A key `env.config.json` carries that the loader does not read is reported,
 * not dropped in silence.
 *
 * It is still dropped — the merge is unchanged, and a forward-compat key is a
 * legitimate thing to write. What was missing was any signal at all, and the
 * cost is not hypothetical: a mis-typed `review.required` leaves the commit
 * gate on, a mis-typed `teardown.deleteRemoteBranch` reverts to `prompt`, and
 * in both cases the symptom is that nothing happened. v19's own notes named
 * this for the retired `open` key — a blind spot recorded in prose, which
 * `.claude/rules/negative-checks.md` says prose alone does not prevent.
 *
 * The check ACCUSES (it tells you your config is wrong), so the stays-silent
 * tests below are the load-bearing half — in particular the one that walks the
 * shipped example. That one is what keeps the known-key set honest as keys are
 * added: a new key reaching `mergeConfig` and the example but not the defaults
 * would make the example accuse itself.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadEnvConfig, collectUnknownKeys, CONFIG_FILE } = require('../src/env/config.js')
const { run } = require('../src/cli.js')

const REPO = path.join(__dirname, '..', '..', '..')
const EXAMPLE = path.join(__dirname, '..', 'assets', 'core', 'env.config.json.example')

function tmpProject(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-unknown-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(config, null, 2))
  return dir
}

// Run the CLI capturing both streams separately — which stream a line lands on
// is part of what these tests assert.
async function capture(argv) {
  const outW = process.stdout.write
  const errW = process.stderr.write
  let out = ''
  let err = ''
  process.stdout.write = (c) => ((out += c), true)
  process.stderr.write = (c) => ((err += c), true)
  try {
    await run(argv)
  } finally {
    process.stdout.write = outW
    process.stderr.write = errW
  }
  return { out, err }
}

test('a top-level stray and a nested typo are both named', () => {
  assert.deepStrictEqual(
    collectUnknownKeys({
      open: true,
      registry: '.spec-env/registry.json',
      review: { readr: 'remote', required: false },
      docker: { portbase: 4000 },
    }),
    ['open', 'review.readr', 'docker.portbase'],
  )
})

test('array contents are data, not keys', () => {
  assert.deepStrictEqual(
    collectUnknownKeys({
      setup: ['pnpm install'],
      dev: [{ name: 'web', command: 'pnpm dev', portVar: 'PORT', anything: 1 }],
      spec: { companionPaths: ['specs/.core/{identifier}.json'] },
      live: { migrations: ['db/migrations/*.sql'] },
      hotfix: { targets: ['v1.2.3'] },
    }),
    [],
  )
})

test('the seedFiles array shorthand is not walked as an object', () => {
  assert.deepStrictEqual(collectUnknownKeys({ seedFiles: ['.env', '.env.local'] }), [])
  assert.deepStrictEqual(collectUnknownKeys({ seedFiles: { mode: 'copy', files: [] } }), [])
  assert.deepStrictEqual(collectUnknownKeys({ seedFiles: { mode: 'copy', flies: [] } }), [
    'seedFiles.flies',
  ])
})

test('loadEnvConfig reports them and loads the config anyway', () => {
  const dir = tmpProject({ open: true, baseBranch: 'develop', review: { readr: 'remote' } })
  const { config, present, unknown } = loadEnvConfig(dir)

  assert.strictEqual(present, true)
  assert.deepStrictEqual(unknown, ['open', 'review.readr'])
  assert.strictEqual(config.baseBranch, 'develop', 'the known keys still merged')
  assert.strictEqual(config.review.reader, 'detect', 'the unknown one still had no effect')
})

test('every spec-env subcommand says it, on stderr, and still runs', async () => {
  const dir = tmpProject({ open: true, review: { readr: 'remote' } })
  const { out, err } = await capture(['spec-env', 'status', '--dir', dir])

  assert.match(err, /unknown key "open" is ignored/)
  assert.match(err, /unknown key "review\.readr" is ignored/)
  assert.doesNotMatch(out, /unknown key/, 'stdout is for the payload')
  assert.ok(out.length, 'the subcommand still ran')
})

test('the advisory never reaches stdout in --json mode', async () => {
  // This is the whole reason it is on stderr: a --json subcommand's stdout is a
  // payload something downstream parses, and a line prepended to it would make
  // that payload unreadable.
  const dir = tmpProject({ open: true })
  const { out, err } = await capture(['spec-env', 'status', '--dir', dir, '--json'])

  assert.match(err, /unknown key "open" is ignored/)
  assert.doesNotMatch(out, /unknown key/)
})

// --- stays silent on healthy-but-unusual inputs -----------------------------

test('the shipped example config accuses itself of nothing', () => {
  const example = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'))
  assert.deepStrictEqual(
    collectUnknownKeys(example),
    [],
    'a key that reached mergeConfig and the example but not the defaults',
  )
})

test("this repo's own live config accuses itself of nothing", () => {
  assert.deepStrictEqual(loadEnvConfig(REPO).unknown, [])
})

test('an absent config reports nothing and does not throw', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-unknown-none-'))
  const { present, unknown } = loadEnvConfig(dir)
  assert.strictEqual(present, false)
  assert.deepStrictEqual(unknown, [])
})

test('an empty config reports nothing', () => {
  assert.deepStrictEqual(loadEnvConfig(tmpProject({})).unknown, [])
  assert.deepStrictEqual(collectUnknownKeys(null), [])
  assert.deepStrictEqual(collectUnknownKeys([]), [])
})

test('a known key with a rejected value is not reported as unknown', () => {
  // Out of scope by decision: these already fall through to a documented
  // conservative default. Reporting them would change what the line means.
  assert.deepStrictEqual(
    collectUnknownKeys({ mode: 'Checkout', teardown: { deleteRemoteBranch: 'yes' } }),
    [],
  )
})
