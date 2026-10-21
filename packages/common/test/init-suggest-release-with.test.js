'use strict'

/**
 * `init` / `update` SUGGEST `hotfix.releaseWith` where skittership's hotfix
 * release is installed, and never write it: it changes what a hotfix land
 * does, which is the project's decision. The stays-silent cases are the
 * load-bearing half — no script, a project that already chose, no isolation.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, resync, lastReport } = require('../src/init.js')

function project({ script = true, hotfix } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-relwith-'))
  if (script) {
    fs.mkdirSync(path.join(dir, 'scripts'))
    fs.writeFileSync(path.join(dir, 'scripts', 'release-hotfix.cjs'), '// skittership\n')
  }
  if (hotfix !== undefined) {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify(hotfix === null ? {} : { hotfix }),
    )
  }
  return dir
}

async function quiet(fn) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => ((out += c), true)
  try {
    await fn()
  } finally {
    process.stdout.write = orig
  }
  return out
}

const runInit = (dir) => quiet(() => init({ dir, force: false, claudeMd: false, mode: 'init' }))

test('init suggests releaseWith when the script is there and nothing is set', async () => {
  const dir = project({ hotfix: null })
  try {
    const out = await runInit(dir)
    assert.match(out, /suggestions:\n\s+- scripts\/release-hotfix\.cjs is installed/)
    assert.match(lastReport().suggestions[0], /"releaseWith": "node scripts\/release-hotfix\.cjs --json"/)
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'))
    assert.strictEqual(written.hotfix, undefined, 'suggested, never written')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('update suggests it too', async () => {
  const dir = project({ hotfix: null })
  try {
    await runInit(dir)
    const out = await quiet(() => resync(dir, { force: false, claudeMd: false }))
    assert.match(out, /scripts\/release-hotfix\.cjs is installed/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: no script on disk', async () => {
  const dir = project({ script: false, hotfix: null })
  try {
    const out = await runInit(dir)
    assert.doesNotMatch(out, /release-hotfix/)
    assert.deepStrictEqual(lastReport().suggestions, [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: the project already set releaseWith', async () => {
  const dir = project({ hotfix: { releaseWith: 'node scripts/release-hotfix.cjs --json --allow-postversion' } })
  try {
    await runInit(dir)
    assert.deepStrictEqual(lastReport().suggestions, [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: no isolation config at all', async () => {
  const dir = project()
  try {
    await runInit(dir)
    assert.deepStrictEqual(lastReport().suggestions, [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
