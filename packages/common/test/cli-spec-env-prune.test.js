'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

// Scaffold an isolation-enabled project.
function scaffold(withConfig = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-prune-'))
  if (withConfig) {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' } }, null, 2),
    )
  } else {
    fs.mkdirSync(path.join(dir, 'specs'), { recursive: true })
  }
  return dir
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

test('spec-env prune reports the not-enabled path when config is absent', async () => {
  const dir = scaffold(false)
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  assert.match(out, /isolation not enabled/, 'refuses without env.config.json')
})

test('spec-env prune is a clean no-op with nothing stale', async () => {
  const dir = scaffold()
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  assert.match(out, /nothing to prune/)
  assert.doesNotMatch(out, /volume|docker/i, 'says nothing about Docker volumes')
})

test('spec-env prune reaps a review-server pidfile whose process is gone', async () => {
  const dir = scaffold()
  const pids = path.join(dir, '.spec-env', 'pids')
  fs.mkdirSync(pids, { recursive: true })
  // A pid far above any real one: nothing answers to it.
  fs.writeFileSync(path.join(pids, 'review-serve.pid'), '99999999\n')
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  assert.match(out, /reaped a stale review-server pidfile/)
  assert.ok(!fs.existsSync(path.join(pids, 'review-serve.pid')))
})

// Retired with per-spec Docker stacks: still accepted, so an old script does
// not have `7` read as a spec name.
test('spec-env prune still accepts --older-than', async () => {
  const dir = scaffold()
  const out = await runQuiet(['spec-env', 'prune', '--older-than', '7', '--dir', dir])
  assert.match(out, /nothing to prune/)
})

// A project that still carries the retired `docker` key prunes nothing of it.
test('a leftover docker config lists no volumes', async () => {
  const dir = scaffold()
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, docker: { enabled: true } }),
  )
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  assert.match(out, /nothing to prune/)
  assert.doesNotMatch(out, /orphan/)
})
