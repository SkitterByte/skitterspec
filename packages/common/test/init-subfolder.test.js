'use strict'

// `skitterspec init` run in a project that may sit in a subfolder of its repo
// (spec feat-subfolder-project, phase 5) — the install an adopter gets without
// moving files by hand. Built on test/helpers/repo.js, so `pnpm test:nested`
// runs it nested; at prefix '' it pins today's install.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init } = require('../src/init.js')
const { makeRepo } = require('./helpers/repo.js')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function cli(cwd, ...args) {
  return execFileSync(process.execPath, [BIN, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
}

// A repo with no skitterspec install in it yet: the project folder is just a folder.
function bare() {
  const repo = makeRepo({ name: 'skitterspec-initsub-', config: null })
  fs.rmSync(path.join(repo.dir, 'specs'), { recursive: true, force: true })
  return repo
}

async function install(repo) {
  await init({ dir: repo.dir, force: false, claudeMd: false, mode: 'init', isolation: true })
}

test('init trusts the worktree root beside the REPO, named for the repo', async () => {
  const repo = bare()
  try {
    await install(repo)
    const settings = JSON.parse(fs.readFileSync(path.join(repo.dir, '.claude', 'settings.local.json'), 'utf8'))
    const expected = path.resolve(repo.root, `../${path.basename(repo.root)}-wt`)
    assert.deepStrictEqual(settings.permissions.additionalDirectories, [expected])
  } finally {
    repo.cleanup()
  }
})

test('init writes everything into the project folder, hooks addressed from it', async () => {
  const repo = bare()
  try {
    await install(repo)
    assert.ok(fs.existsSync(path.join(repo.dir, 'specs', '.core', 'env.config.json')))
    assert.match(fs.readFileSync(path.join(repo.dir, '.gitignore'), 'utf8'), /\.spec-env/)
    const hooks = fs.readFileSync(path.join(repo.dir, '.claude', 'settings.json'), 'utf8')
    assert.match(hooks, /CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\//)
    if (repo.prefix) {
      // stays silent: nothing is written at the repo root above it.
      assert.ok(!fs.existsSync(path.join(repo.root, 'specs')), 'no specs/ at the root')
      assert.ok(!fs.existsSync(path.join(repo.root, '.claude')), 'no .claude/ at the root')
    }
  } finally {
    repo.cleanup()
  }
})

test('the installed project is one spec-env accepts, from the project folder', async () => {
  const repo = bare()
  try {
    await install(repo)
    const out = cli(repo.dir, 'spec-env', 'status')
    assert.doesNotMatch(out, /isolation not enabled/, out)
    const status = cli(repo.dir, 'status')
    if (repo.prefix) assert.match(status, new RegExp(`^subfolder: {2}${repo.prefix.replace(/\./g, '\\.')}/`))
    else assert.doesNotMatch(status, /subfolder:/)
  } finally {
    repo.cleanup()
  }
})
