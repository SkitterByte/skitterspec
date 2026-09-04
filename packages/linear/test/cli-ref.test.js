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
function fixtureRepo({ folder = 'feat-safer-init', identifier = 'SKS-7', branch = 'feat/safer-init', bucket = 'in-progress', others = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-ref-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1', teamKey: 'SKS' } }), 'utf-8')

  const spec = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), `${fm}# Spec\n`, 'utf-8')

  // Other specs sharing the repo — the backlog spec authored mid-branch is one.
  for (const o of others) {
    const dirO = path.join(dir, 'specs', o.bucket || 'backlog', o.folder)
    fs.mkdirSync(dirO, { recursive: true })
    const fmO = o.identifier ? `---\nlinear_identifier: "${o.identifier}"\n---\n\n` : ''
    fs.writeFileSync(path.join(dirO, '00-overview.md'), `${fmO}# Spec\n`, 'utf-8')
  }

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

// --- `ref <spec>` — the explicit override ------------------------------------
//
// `ref` answers "what ticket does this BRANCH belong to", which is the same
// thing as "what ticket does this COMMIT belong to" only while you are
// committing that branch's own implementation work. Author a backlog spec
// part-way through another spec and the two diverge: the commit is entirely the
// new spec's, and the branch answer is a wrong ref stamped on it.
//
// Naming the spec resolves it directly. The bare form is untouched — it still
// always follows the branch, so there is no staged-path guesswork and no ref
// that silently disagrees with where you are.

// The reported case: mid-branch on one spec, committing another spec's files.
const midBranch = () =>
  fixtureRepo({
    folder: 'feat-walk-to-run',
    identifier: 'SKS-90',
    branch: 'feat/walk-to-run',
    others: [{ folder: 'feat-distance-prescriptions', identifier: 'SKS-102' }],
  })

test('a named spec resolves to ITS ref, not the branch it is committed from', async () => {
  const r = await run(['ref', 'feat-distance-prescriptions'], midBranch())
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.out, 'SKS-102\n', "the commit's spec, not feat/walk-to-run's SKS-90")
})

test('a named spec resolves from a branch that is no spec at all', async () => {
  const dir = fixtureRepo({ branch: 'main', others: [{ folder: 'feat-distance-prescriptions', identifier: 'SKS-102' }] })
  const r = await run(['ref', 'feat-distance-prescriptions'], dir)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.out, 'SKS-102\n', 'naming the spec makes the branch irrelevant')
})

test('--json on a named spec reports the spec asked for and the real branch', async () => {
  const r = await run(['ref', 'feat-distance-prescriptions', '--json'], midBranch())
  assert.deepEqual(JSON.parse(r.out), {
    ref: 'SKS-102',
    spec: 'feat-distance-prescriptions',
    branch: 'feat/walk-to-run',
  })
})

test('a named spec is found in any lifecycle bucket', async () => {
  const dir = fixtureRepo({ others: [{ folder: 'bug-old-thing', identifier: 'SKS-55', bucket: 'complete' }] })
  assert.strictEqual((await run(['ref', 'bug-old-thing'], dir)).out, 'SKS-55\n')
})

// The no-ref contract holds for the named form too: stdout stays empty so a
// `$(…)` splice can never put an error message inside a commit message.

test('an unknown spec name exits non-zero with EMPTY stdout', async () => {
  const r = await run(['ref', 'feat-no-such-spec'], midBranch())
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '', 'nothing for a shell to splice into a commit')
  assert.match(r.err, /feat-no-such-spec/)
})

test('a named spec that is not linked exits non-zero with empty stdout', async () => {
  const dir = fixtureRepo({ others: [{ folder: 'feat-local-only', identifier: null }] })
  const r = await run(['ref', 'feat-local-only'], dir)
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '')
  assert.match(r.err, /feat-local-only is not linked/)
})

// --- the default must not move ----------------------------------------------
//
// The stays-silent half of the fix: adding the override must not make the bare
// form clever. It follows the branch even when the repo is full of other linked
// specs that a staged-path heuristic might have preferred.

test('the bare form still follows the branch when other linked specs exist', async () => {
  const r = await run(['ref'], midBranch())
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.out, 'SKS-90\n', 'unchanged: the branch is the default answer')
})
