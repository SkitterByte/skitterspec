'use strict'

/**
 * `spec-sync retarget` — detect a team-key rename and plan the rewrite.
 *
 * Two properties matter most, and both are about NOT acting:
 *   - a repo already on the current key plans nothing and reads nothing;
 *   - a mapping whose spot-check fails is refused before a single file moves.
 *
 * The spot-check is deliberately one read comparing the issue TITLE. Existence
 * alone proves nothing: `SKS-7` existing does not make it the issue that was
 * `SKI-7`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const TITLE = 'Safer init'

function fixtureRepo({ teamKey = 'SKI', stampKey = 'SKI' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-retarget-cli-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1', teamKey } }), 'utf-8')

  const folder = path.join(dir, 'specs', 'complete', 'feat-safer-init')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    `---\nlinear_identifier: "${stampKey}-7"\nlinear_url: "https://linear.app/acme/issue/${stampKey.toLowerCase()}-7/safer-init"\n---\n\n# ${TITLE}\n\nProbe ${stampKey}-28 is prose.\n`,
    'utf-8',
  )
  fs.writeFileSync(
    path.join(folder, '01-engine.md'),
    `---\nlinear_issue_id: "${stampKey}-8"\n---\n\n# Phase 1 — Engine ⬜\n\n**Goal:** go.\n`,
    'utf-8',
  )
  const base = path.join(dir, 'specs', '.core', 'linear-base')
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(
    path.join(base, `${stampKey}-7.base.json`),
    JSON.stringify({ issue: 'aaaa', subIssues: { [`${stampKey}-8`]: 'bbbb' } }, null, 2) + '\n',
    'utf-8',
  )
  return dir
}

function fakeLinear({ teamKey = 'SKS', title = TITLE, absent = false } = {}) {
  const reads = []
  return {
    reads,
    async readTeam(id) {
      return { id, key: teamKey, name: 'Skitterspec' }
    },
    async readIssue(id) {
      reads.push(id)
      return absent ? null : { id, identifier: id, title }
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

const read = (dir, ...p) => fs.readFileSync(path.join(dir, ...p), 'utf8')
const OVERVIEW = ['specs', 'complete', 'feat-safer-init', '00-overview.md']

// --- no rename ---------------------------------------------------------------

test('a repo already on the current key is a clean no-op', async () => {
  const dir = fixtureRepo({ teamKey: 'SKS', stampKey: 'SKS' })
  const linear = fakeLinear({ teamKey: 'SKS' })
  const r = await run(['retarget'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /already current/)
  assert.deepEqual(linear.reads, [], 'nothing to remap, so no issue is read at all')
})

// --- the plan ----------------------------------------------------------------

test('a rename is detected and the plan counts every category', async () => {
  const dir = fixtureRepo()
  const r = await run(['retarget'], dir, { adapter: fakeLinear() })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /recorded key: SKI/)
  assert.match(r.out, /linear\s+key:\s+SKS\s+<- renamed/)
  assert.match(r.out, /2 frontmatter stamp\(s\)/)
  assert.match(r.out, /1 base snapshot\(s\)/)
  assert.match(r.out, /1 config key/)
  assert.match(r.out, /dry-run — re-run with --yes to apply/)
})

test('the dry run changes nothing on disk', async () => {
  const dir = fixtureRepo()
  const before = read(dir, ...OVERVIEW)
  await run(['retarget'], dir, { adapter: fakeLinear() })
  assert.strictEqual(read(dir, ...OVERVIEW), before)
  assert.ok(fs.existsSync(path.join(dir, 'specs/.core/linear-base/SKI-7.base.json')))
})

// --- the spot-check ----------------------------------------------------------

test('it spot-checks exactly one identifier, by title', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const r = await run(['retarget'], dir, { adapter: linear })

  assert.deepEqual(linear.reads, ['SKS-7'], 'one read, on the remapped spec issue')
  assert.match(r.out, /spot-check: SKS-7 resolves, title matches the spec/)
})

test('a title mismatch refuses the plan — existence is not identity', async () => {
  const dir = fixtureRepo()
  const r = await run(['retarget'], dir, { adapter: fakeLinear({ title: 'Something else entirely' }) })

  assert.strictEqual(r.code, 1)
  assert.match(r.out, /its title is "Something else entirely"/)
  assert.match(r.out, /refusing — the mapping is not safe to apply/)
})

test('a remapped identifier that does not exist refuses too', async () => {
  const dir = fixtureRepo()
  const r = await run(['retarget'], dir, { adapter: fakeLinear({ absent: true }) })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /SKS-7 does not exist in Linear/)
  assert.match(r.out, /refusing/)
})

test('a failed spot-check writes nothing, even with --yes', async () => {
  const dir = fixtureRepo()
  const before = read(dir, ...OVERVIEW)
  const r = await run(['retarget', '--yes'], dir, { adapter: fakeLinear({ absent: true }) })
  assert.strictEqual(r.code, 1)
  assert.strictEqual(read(dir, ...OVERVIEW), before, 'the refusal comes before any write')
})

// --- refusals ----------------------------------------------------------------

test('no teamId is a refusal, not a silent success', async () => {
  const dir = fixtureRepo()
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ linear: { teamKey: 'SKI' } }), 'utf-8')
  const r = await run(['retarget'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no linear\.teamId/)
})

test('stamps that disagree are reported rather than guessed at', async () => {
  const dir = fixtureRepo({ teamKey: '' })
  fs.writeFileSync(
    path.join(dir, 'specs', 'complete', 'feat-safer-init', '02-other.md'),
    '---\nlinear_issue_id: "OTHER-3"\n---\n\n# Phase 2\n',
    'utf-8',
  )
  const r = await run(['retarget'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /cannot tell which key this repo is stamped with/)
  assert.match(r.out, /disagree/)
})

test('an empty teamKey falls back to the stamps and still plans', async () => {
  const dir = fixtureRepo({ teamKey: '' })
  const r = await run(['retarget'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /recorded key: SKI\s+\(from stamps\)/)
})

test('the MCP path says why it cannot detect, and changes nothing', async () => {
  const dir = fixtureRepo()
  const before = read(dir, ...OVERVIEW)
  const r = await run(['retarget', '--via', 'mcp'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /get_team does not return a team key/)
  assert.match(r.out, /nothing was changed/)
  assert.strictEqual(read(dir, ...OVERVIEW), before)
})
