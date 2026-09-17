'use strict'

/**
 * `spec-sync preserve` — keep the reporter's original description before the
 * linking push replaces it with the generated spec.
 *
 * The property under test is narrow and the silence around it is wide: this
 * posts ONE comment, exactly once, and every case it cannot act on exits 0
 * saying so rather than failing the adoption that called it. Half the tests
 * below are stays-silent tests for that reason — a preserve that refused would
 * turn a courtesy into a gate on `/spec`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const ADOPTED = 'SKI-123'
const ORIGINAL = 'The export button does nothing.\n\n- Chrome 121\n- only on big accounts'

// A repo holding one adopted spec. `intake` overrides let a test decline the
// feature; `identifier: null` is a spec that was never linked.
function repoWithSpec({ identifier = ADOPTED, intake = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-preserve-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(
    cfg,
    JSON.stringify({ linear: { teamId: 'T1' }, intake: { label: 'web-app', ...intake } }),
    'utf-8',
  )

  const spec = path.join(dir, 'specs', 'backlog', 'feat-adopted')
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    fm + '# Adopted\n\n## Problem\n\nThe export times out.\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(spec, '01-fix.md'), '# Phase 1 — Fix it ⬜\n\n**Goal:** fixed.\n', 'utf-8')
  return dir
}

// A fake Linear holding one issue and its comments. `comments` seeds what is
// already there; `posted` records what this run wrote.
function fakeLinear({ description = ORIGINAL, comments = [], failList = false, failPost = false } = {}) {
  const posted = []
  return {
    posted,
    seeded: comments,
    async readIssue(id) {
      return { id: 'uuid-1', identifier: id, url: `https://linear.app/x/${id}`, description }
    },
    async listComments() {
      if (failList) throw new Error('comments unavailable')
      return comments
    },
    async createComment(issueId, body) {
      if (failPost) throw new Error('Linear refused')
      posted.push({ issueId, body })
      return { id: 'c1', body }
    },
    async listIssueStates() {
      return [{ id: 's1', name: 'Backlog', type: 'backlog' }]
    },
  }
}

function run(argv, cwd, io = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: { LINEAR_API_KEY: 'lin_api_test' },
    ...io,
  }).then((code) => ({ code, out: out.join('') }))
}

// --- the happy path ----------------------------------------------------------

test('it posts the original description as a comment', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear()
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 1, 'exactly one comment')
  assert.strictEqual(linear.posted[0].issueId, 'uuid-1', 'posted onto the adopted issue')
  assert.match(r.out, /original report preserved/i)
})

test('the comment keeps the description verbatim and carries the marker', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear()
  await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  const body = linear.posted[0].body
  assert.ok(body.includes(ORIGINAL), 'the reporter\'s text is unaltered — not reflowed, not canonicalised')
  assert.ok(body.includes('<!-- skitterspec:original-report -->'), 'the idempotence marker rides along')
  assert.ok(body.startsWith('**Original report**'), 'and the visible lead-in a human reads')
  assert.match(body, /feat-adopted/, 'it names the spec the description is now a mirror of')
})

test('--json reports what it did, for a caller that parses', async () => {
  const dir = repoWithSpec()
  const r = await run(['preserve', 'feat-adopted', '--json'], dir, { adapter: fakeLinear() })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.preserved, true)
  assert.strictEqual(got.reason, 'posted')
  assert.strictEqual(got.identifier, ADOPTED)
})

// --- idempotence -------------------------------------------------------------

test('a second run posts nothing — the marker is found', async () => {
  const dir = repoWithSpec()
  const first = fakeLinear()
  await run(['preserve', 'feat-adopted'], dir, { adapter: first })

  // The comment the first run wrote is what the second run sees.
  const second = fakeLinear({ comments: [{ id: 'c1', body: first.posted[0].body }] })
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: second })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(second.posted.length, 0, 'nothing posted twice')
  assert.match(r.out, /already carries the original report/)
})

test('the visible lead-in alone is enough, if Linear ate the HTML comment', async () => {
  // WHAT THIS PINS: the marker is an HTML comment, and a tracker that strips
  // those on save would make every run read as "not yet preserved". The second
  // signal is what degrades that to a duplicate check rather than duplicate
  // comments.
  const dir = repoWithSpec()
  const stripped = '**Original report** — preserved before this issue became a spec.\n\n' + ORIGINAL
  const linear = fakeLinear({ comments: [{ id: 'c1', body: stripped }] })
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(linear.posted.length, 0)
  assert.match(r.out, /already carries the original report/)
})

test('an unrelated comment is not mistaken for the marker', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear({ comments: [{ id: 'c1', body: 'Looks like the original report was about exports' }] })
  await run(['preserve', 'feat-adopted'], dir, { adapter: linear })
  assert.strictEqual(linear.posted.length, 1, 'prose mentioning the phrase must not suppress the write')
})

// --- stays silent: every cannot-tell exits 0 ---------------------------------

test('the opt-out does nothing and says nothing at all', async () => {
  const dir = repoWithSpec({ intake: { preserveOriginal: false } })
  const linear = fakeLinear()
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 0)
  assert.strictEqual(r.out, '', 'a project that declined sees no trace of the feature')
})

test('an unlinked spec is skipped, never a failure', async () => {
  const dir = repoWithSpec({ identifier: null })
  const linear = fakeLinear()
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 0)
  assert.match(r.out, /not linked/)
})

test('an issue with no description has nothing to preserve, and says so', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear({ description: '' })
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 0, 'never post an empty comment claiming to preserve something')
  assert.match(r.out, /no description to preserve/)
})

test('a description that was never read reads as absent, not as empty', async () => {
  const dir = repoWithSpec()
  // `null`, not `undefined` — the latter takes the fake's default and would
  // quietly test the happy path instead. Linear returns null for an issue whose
  // description was never set.
  const linear = fakeLinear({ description: null })
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 0)
})

test('an unreachable Linear exits 0 — it is no evidence either way', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear()
  linear.readIssue = async () => {
    throw new Error('getaddrinfo ENOTFOUND')
  }
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0, 'adoption must not fail because preserving could not run')
  assert.match(r.out, /could not read/)
})

test('a refused comment exits 0 and names the refusal', async () => {
  const dir = repoWithSpec()
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: fakeLinear({ failPost: true }) })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /refused the comment/)
})

test('a comment listing that fails posts anyway — duplicate beats losing it', async () => {
  // The cannot-tell branch that matters: without the listing there is no way to
  // know whether this already ran, and the two readings cost differently.
  const dir = repoWithSpec()
  const linear = fakeLinear({ failList: true })
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 1)
  assert.match(r.out, /could not list/)
})

// --- ordering ----------------------------------------------------------------

test('a spec already pushed is warned about, not refused', async () => {
  const dir = repoWithSpec()
  // A base snapshot means the description on the issue is already this spec's
  // own mirror — so preserve is running late.
  const base = path.join(dir, 'specs', '.core', 'linear-base')
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(path.join(base, `${ADOPTED}.base.json`), JSON.stringify({ issue: 'h' }), 'utf-8')

  const linear = fakeLinear()
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 1, 'warn, never refuse — a snapshot can be absent for innocent reasons')
  assert.match(r.out, /pushed before/)
})

// --- the MCP path ------------------------------------------------------------

test('without a key it writes nothing and prints the body to post', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear()
  const r = await run(['preserve', 'feat-adopted'], dir, { adapter: linear, env: {} })

  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 0, 'the engine cannot call an MCP tool, so it must not claim to')
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /skitterspec:original-report/, 'it names the marker the skill must check for')
})

test('--text supplies the description the skill read over MCP', async () => {
  const dir = repoWithSpec()
  const file = path.join(dir, 'original.md')
  fs.writeFileSync(file, ORIGINAL, 'utf-8')
  const r = await run(['preserve', 'feat-adopted', '--text', file, '--via', 'mcp', '--json'], dir, {
    adapter: fakeLinear(),
  })

  const got = JSON.parse(r.out)
  assert.strictEqual(got.preserved, false, 'still no write from the engine')
  assert.ok(got.body.includes(ORIGINAL), 'but the body is composed and ready to post')
})

test('--text wins over the issue on the API path, so a read-back is never re-read', async () => {
  const dir = repoWithSpec()
  const file = path.join(dir, 'original.md')
  fs.writeFileSync(file, 'what the reporter actually filed', 'utf-8')
  const linear = fakeLinear({ description: 'something else entirely' })
  await run(['preserve', 'feat-adopted', '--text', file], dir, { adapter: linear })

  assert.match(linear.posted[0].body, /what the reporter actually filed/)
})

test('an unreadable --text is a real failure, not a silent skip', async () => {
  // The one non-zero exit here, and deliberately: the caller named a file, so
  // an unreadable one is a broken invocation rather than a cannot-tell.
  const dir = repoWithSpec()
  const r = await run(['preserve', 'feat-adopted', '--text', path.join(dir, 'nope.md')], dir, {
    adapter: fakeLinear(),
  })

  assert.strictEqual(r.code, 1)
  assert.match(r.out, /cannot read --text/)
})

// --- routing -----------------------------------------------------------------

test('preserve is listed in the usage, so routing and docs cannot drift', async () => {
  const dir = repoWithSpec()
  const r = await run(['nonsense-subcommand'], dir)
  assert.match(r.out, /spec-sync preserve <spec>/)
})

test('a spec that does not exist refuses rather than guessing one', async () => {
  const dir = repoWithSpec()
  const r = await run(['preserve', 'feat-nope'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /spec not found/)
})
