'use strict'

/**
 * `spec-sync comment <spec> --file <f>` — post a file onto the spec's issue as
 * a comment, the surface no later push can clobber. `/spec-complete` posts an
 * incident's log through it. Misuse (no readable file) exits 1; every
 * cannot-tell exits 0 and says so rather than failing the completion.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function repoWithSpec({ identifier = 'SKI-7' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-comment-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')
  const spec = path.join(dir, 'specs', 'in-progress', 'incident-api-outage')
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), fm + '# Incident\n\n## Impact\n\nDown.\n', 'utf-8')
  fs.writeFileSync(path.join(spec, '01-response.md'), '# Phase 1 — Response ⬜\n\n**Goal:** recover.\n', 'utf-8')
  return dir
}

function fakeLinear() {
  const posted = []
  return {
    posted,
    async readIssue(id) {
      return { id: 'uuid-7', identifier: id }
    },
    async createComment(issueId, body) {
      posted.push({ issueId, body })
      return { id: 'c1', body }
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

test('it posts the file onto the linked issue', async () => {
  const dir = repoWithSpec()
  const logFile = path.join(dir, 'incident-log.md')
  fs.writeFileSync(logFile, '# Incident log\n\nIt was DNS.\n')
  const linear = fakeLinear()
  const r = await run(['comment', 'incident-api-outage', '--file', logFile], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, r.out)
  assert.strictEqual(linear.posted.length, 1)
  assert.strictEqual(linear.posted[0].issueId, 'uuid-7')
  assert.match(linear.posted[0].body, /It was DNS/)
})

test('misuse exits 1; every cannot-tell exits 0 and posts nothing', async () => {
  const dir = repoWithSpec()
  const linear = fakeLinear()
  assert.strictEqual((await run(['comment', 'incident-api-outage'], dir, { adapter: linear })).code, 1)
  // An unlinked spec is a state to report, never a failure.
  const plain = repoWithSpec({ identifier: null })
  const logFile = path.join(plain, 'incident-log.md')
  fs.writeFileSync(logFile, 'log\n')
  const r = await run(['comment', 'incident-api-outage', '--file', logFile], plain, { adapter: linear })
  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.posted.length, 0)
  assert.match(r.out, /not linked — nothing posted/)
})
