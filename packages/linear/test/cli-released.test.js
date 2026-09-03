'use strict'

/**
 * `spec-sync released` — over a real git repo, because reading the range is the
 * half `released.js` deliberately does not own. What matters here is that the
 * trailer survives the trip through `git log` intact: a multi-line body, a
 * fenced block, and a subject containing the NUL-ish separators all have to come
 * back as the parser expects.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-released-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q')
  git('config', 'user.email', 't@e.com')
  git('config', 'user.name', 'T')
  return {
    dir,
    commit(message) {
      fs.appendFileSync(path.join(dir, 'f.txt'), message + '\n')
      git('add', '-A')
      git('commit', '-q', '-m', message)
    },
    tag(name) {
      git('tag', name)
    },
  }
}

function run(argv, cwd, io = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: {},
    ...io,
  }).then((code) => ({ code, out: out.join('') }))
}

test('it reports the tickets in a range, deduped, with the unreferenced count', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat(a): one\n\nRefs: SKS-1')
  r.commit('feat(a): two\n\nRefs: SKS-1')
  r.commit('chore: tidy')
  r.commit('fix(b): three\n\nRefs: SKS-2')

  const got = await run(['released', 'v1.0.0..HEAD', '--json'], r.dir)
  const json = JSON.parse(got.out)
  assert.strictEqual(got.code, 0)
  assert.deepEqual(json.tickets, [
    { ref: 'SKS-2', commits: 1 },
    { ref: 'SKS-1', commits: 2 },
  ], 'newest first, as git log orders them')
  assert.strictEqual(json.unreferenced, 1)
  assert.strictEqual(json.total, 4)
})

test('a trailer quoted inside a fenced block does not join the release', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('docs(rules): explain the trailer\n\nAdd this to a commit:\n\n```\nRefs: SKS-99\n```\n')

  const json = JSON.parse((await run(['released', 'v1.0.0..HEAD', '--json'], r.dir)).out)
  assert.deepEqual(json.tickets, [], 'the commit documents the convention; it is not part of SKS-99')
  assert.strictEqual(json.unreferenced, 1)
})

test('the unreferenced count is stated even when it is zero', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat(a): one\n\nRefs: SKS-1')

  const got = await run(['released', 'v1.0.0..HEAD'], r.dir)
  assert.match(got.out, /0 commit\(s\) carry no ref/, 'silence would read as "all accounted for"')
})

test('with no range it defaults to the last tag, and says which', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v2.3.4')
  r.commit('feat(a): one\n\nRefs: SKS-1')

  const got = await run(['released'], r.dir)
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /released: v2\.3\.4\.\.HEAD/, 'the chosen range is visible, not silent')
  assert.match(got.out, /SKS-1/)
})

test('with no range and no tags it refuses, naming the fix', async () => {
  const r = repo()
  r.commit('chore: base')
  const got = await run(['released'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no range given and no tag/)
  assert.match(got.out, /spec-sync released v1\.2\.0\.\.HEAD/, 'shows the form to pass')
})

test('a range git cannot resolve is refused, naming it', async () => {
  const r = repo()
  r.commit('chore: base')
  const got = await run(['released', 'nope..HEAD'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /could not resolve the range "nope\.\.HEAD"/)
})

test('titles are an enrichment — their absence degrades, never fails', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat(a): one\n\nRefs: SKS-1')

  // No API key configured, so the transport is mcp and no title lookup happens.
  const got = await run(['released', 'v1.0.0..HEAD'], r.dir)
  assert.strictEqual(got.code, 0, 'still a successful report')
  assert.match(got.out, /SKS-1/)
  assert.match(got.out, /titles unavailable/)
})

test('titles are attached when the api transport is available', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat(a): one\n\nRefs: SKS-1')

  const adapter = { async readIssue(id) { return { id, identifier: id, title: 'Safer init' } } }
  const got = await run(['released', 'v1.0.0..HEAD'], r.dir, { adapter, env: { LINEAR_API_KEY: 'lin_test' } })
  assert.match(got.out, /SKS-1\s+Safer init/)
  assert.doesNotMatch(got.out, /titles unavailable/)
})

test('a Linear read failure degrades to bare refs rather than failing the report', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat(a): one\n\nRefs: SKS-1')

  const adapter = { async readIssue() { throw new Error('Linear API unreachable') } }
  const got = await run(['released', 'v1.0.0..HEAD'], r.dir, { adapter, env: { LINEAR_API_KEY: 'lin_test' } })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /SKS-1/)
  assert.match(got.out, /titles unavailable/)
})

test('a multi-line body with a subject containing separators still parses', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat(a): handle a|pipe and a: colon\n\n- bullet one\n- bullet two\n\nRelease-Note: A thing.\n\nRefs: SKS-7')

  const json = JSON.parse((await run(['released', 'v1.0.0..HEAD', '--json'], r.dir)).out)
  assert.deepEqual(json.tickets, [{ ref: 'SKS-7', commits: 1 }])
})
