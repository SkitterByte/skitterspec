'use strict'

/**
 * A `/no-spec` branch whose name starts with `epic-` serves its page.
 *
 * WHAT THE BUG WAS (bug-specless-epic-prefix-404): the server's `render` hook
 * asks `isEpic(folder)` — a NAME PREFIX — before anything else, and sends every
 * `epic-*` address to the epic page. A specless branch named
 * `epic-parent-snapshots` has no epic overview, so the epic page found nothing
 * and the route 404'd, while the page sat rendered on disk and `resolveSpec`
 * resolved the name from the registry without complaint.
 *
 * A prefix is a guess about what a name is. The registry's specless record is
 * a positive signal (`.claude/rules/negative-checks.md` rule 1), so it wins.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { serverHooks, createReviewServer, startReviewServer } = require('../src/env/serve.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { readRegistry, writeRegistry } = require('../src/env/registry.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

// A repo with one specless branch named like an epic, recorded the way
// `spec-env nospec` records one: a registry entry, a worktree, nothing in specs/.
function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epicname-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', branch: { pattern: '{type}/{slug}' }, review: { reader: 'local', serve: 'never' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const wt = path.join(path.resolve(dir, `../${path.basename(dir)}-wt`), 'epic-parent-snapshots')
  git(dir, 'worktree', 'add', '-q', '-b', 'chore/epic-parent-snapshots', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nSNAPSHOT\n')
  const { config } = loadEnvConfig(dir)
  const reg = readRegistry(dir, config)
  reg.specless = { ...(reg.specless || {}), 'epic-parent-snapshots': { branch: 'chore/epic-parent-snapshots' } }
  writeRegistry(dir, config, reg)
  return { dir }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// Through the production wiring, as the daemon runs it.
async function serve(dir) {
  const { config } = loadEnvConfig(dir)
  const server = createReviewServer({ ...serverHooks(dir, config), token: null })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/`
  return { get: (p = '') => fetch(base + p), close: () => new Promise((r) => server.close(r)) }
}

test('a specless branch named epic-* serves its own diff, not a missing epic page', async () => {
  // RED BEFORE THE FIX: 404, "not found".
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const res = await s.get('epic-parent-snapshots')
    assert.strictEqual(res.status, 200, 'the /no-spec page must be reachable')
    assert.match(await res.text(), /SNAPSHOT/, "and it is that branch's diff")
  } finally {
    await s.close()
    cleanup(dir)
  }
})

// Stays silent: the prefix still means an epic for every name the registry
// does not claim, so a typo or an unknown epic is still a 404.
test('stays silent: an epic-* name nothing claims is still a 404', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual((await s.get('epic-nonesuch')).status, 404)
  } finally {
    await s.close()
    cleanup(dir)
  }
})
