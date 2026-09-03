'use strict'

/**
 * `spec-sync ref` — the ticket the current branch's work belongs to.
 *
 * The property that carries the most weight is a negative one: every no-ref case
 * must print **nothing on stdout**. The command exists to be spliced into a
 * commit message with `Refs: $(spec-sync ref)`, so an error message on stdout
 * would end up inside the commit — worse than having no command at all.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// A repo with one spec, on a real git branch — `ref` reads HEAD via git, so the
// branch has to actually exist.
function fixtureRepo({ folder = 'feat-safer-init', identifier = 'SKS-7', branch = 'feat/safer-init', bucket = 'in-progress' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-ref-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1', teamKey: 'SKS' } }), 'utf-8')

  const spec = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), `${fm}# Spec\n`, 'utf-8')

  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'ignore', 'ignore'] })
  git('init', '-q')
  git('config', 'user.email', 't@e.com')
  git('config', 'user.name', 'T')
  git('add', '-A')
  git('commit', '-qm', 'fixture')
  if (branch !== 'main' && branch !== 'master') git('checkout', '-qb', branch)
  return dir
}

function run(argv, cwd) {
  const out = []
  const err = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: (s) => err.push(s) },
    env: {},
  }).then((code) => ({ code, out: out.join(''), err: err.join('') }))
}

// --- the happy path ----------------------------------------------------------

test("a linked spec's branch resolves to its identifier", async () => {
  const r = await run(['ref'], fixtureRepo())
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.out, 'SKS-7\n', 'stdout is the bare ref, ready to splice')
})

test('--json carries the ref, the spec and the branch', async () => {
  const r = await run(['ref', '--json'], fixtureRepo())
  assert.deepEqual(JSON.parse(r.out), { ref: 'SKS-7', spec: 'feat-safer-init', branch: 'feat/safer-init' })
})

test('a bug spec resolves through its own branch prefix', async () => {
  const dir = fixtureRepo({ folder: 'bug-stale-ref', identifier: 'SKS-29', branch: 'bug/stale-ref' })
  assert.strictEqual((await run(['ref'], dir)).out, 'SKS-29\n')
})

test('it finds a spec in any lifecycle bucket', async () => {
  const dir = fixtureRepo({ bucket: 'complete' })
  assert.strictEqual((await run(['ref'], dir)).out, 'SKS-7\n')
})

// --- the no-ref cases: stdout must stay empty --------------------------------

test('on main it exits non-zero with EMPTY stdout', async () => {
  const r = await run(['ref'], fixtureRepo({ branch: 'main' }))
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '', 'nothing for a shell to splice into a commit')
  assert.match(r.err, /not a spec branch/)
})

test('an unlinked spec exits non-zero, naming the spec, with empty stdout', async () => {
  const r = await run(['ref'], fixtureRepo({ identifier: null }))
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '')
  assert.match(r.err, /feat-safer-init is not linked/)
})

test('a branch with no matching spec exits non-zero with empty stdout', async () => {
  const r = await run(['ref'], fixtureRepo({ branch: 'chore/tidy-up' }))
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '')
  assert.match(r.err, /chore\/tidy-up/)
})

test('outside a git repository it exits non-zero with empty stdout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-ref-nogit-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')
  const r = await run(['ref'], dir)
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '')
  assert.match(r.err, /not on a git branch/)
})
