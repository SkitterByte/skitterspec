'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

// Scaffold a project with isolation enabled and one worktree-only spec, so
// `spec-env up` runs its plan (no git/docker needed) and exercises the trust step.
function scaffold(slug = 'x') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' } }, null, 2),
  )
  const spec = path.join(dir, 'specs', 'backlog', `feat-${slug}`)
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n',
  )
  return { dir, folder: `feat-${slug}` }
}

// Run the CLI with stdout suppressed; return what was printed.
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

const readLocal = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))

test('spec-env up trusts the worktree root in settings.local.json', async () => {
  const { dir, folder } = scaffold()
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocal(dir).permissions.additionalDirectories, [expected])
  assert.match(out, /trusted:\s+\S+-wt/, 'plan reports the trusted root')
})

test('spec-env up preserves a pre-existing permissions.allow', async () => {
  const { dir, folder } = scaffold()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ permissions: { allow: ['Bash(git *)'] } }, null, 2))
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const settings = readLocal(dir)
  assert.deepStrictEqual(settings.permissions.allow, ['Bash(git *)'], 'allow survived')
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(settings.permissions.additionalDirectories, [expected], 'root added')
})

test('a second spec-env up is a no-op for the trusted root', async () => {
  const { dir, folder } = scaffold()
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocal(dir).permissions.additionalDirectories, [expected])
  assert.match(out, /already in \.claude\/settings\.local\.json/, 'reports already-trusted')
})

test('spec-env up leaves a malformed settings.local.json untouched, warns in the plan', async () => {
  const { dir, folder } = scaffold()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'not json {')
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'not json {', 'file left intact')
  assert.match(out, /trusted:\s+! .*not valid JSON/, 'plan warns about malformed settings')
})
