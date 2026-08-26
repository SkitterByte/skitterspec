'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

// Scaffold an isolation-enabled project. `spec-env prune` shells out to
// `docker volume ls` — in a scratch temp repo whose slug matches nothing, that
// returns no namespace volumes, so these tests exercise the wiring / no-op /
// not-enabled paths without needing (or mutating) real Docker state.
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

test('spec-env prune is a clean no-op when no namespace volumes exist', async () => {
  const dir = scaffold()
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  // Either docker is present and finds nothing, or docker is unavailable — both
  // are non-fatal and must never print an orphan list.
  assert.doesNotMatch(out, /run these:/, 'prints no removal commands')
  assert.match(
    out,
    /no orphaned volumes|could not list docker volumes/,
    'reports a clean no-op or a docker-unavailable notice',
  )
})

test('spec-env prune accepts --older-than without crashing', async () => {
  const dir = scaffold()
  const out = await runQuiet(['spec-env', 'prune', '--older-than', '7', '--dir', dir])
  assert.doesNotMatch(out, /run these:/, 'still no removal commands in a clean repo')
})
