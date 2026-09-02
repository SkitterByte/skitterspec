'use strict'

/**
 * `spec-sync doctor` — identifier drift after a team rename.
 *
 * The behaviour that matters most here is a NEGATIVE one: doctor must not
 * accuse a healthy repo. The hand-run that motivated this reported 146 of 198
 * refs as non-existent, purely because Linear's `team.issues` connection
 * excludes archived issues and caps at 250 per page. Reading each ref
 * individually removes that failure mode by construction, and the
 * archived-heavy test below exists to stop anyone optimising it back in.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// A repo whose specs are stamped with `stampKey`, plus matching snapshots.
function fixtureRepo({ stampKey = 'REU', configKey = 'REU', specs = 3 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-doctor-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1', teamKey: configKey } }), 'utf-8')

  const base = path.join(dir, 'specs', '.core', 'linear-base')
  fs.mkdirSync(base, { recursive: true })
  for (let i = 0; i < specs; i++) {
    const issue = `${stampKey}-${100 + i * 2}`
    const sub = `${stampKey}-${101 + i * 2}`
    const folder = path.join(dir, 'specs', 'complete', `feat-${i}`)
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(
      path.join(folder, '00-overview.md'),
      `---\nlinear_identifier: "${issue}"\nlinear_url: "https://linear.app/acme/issue/${issue}/feat-${i}"\n---\n\n# Feat ${i}\n`,
      'utf-8',
    )
    fs.writeFileSync(
      path.join(folder, '01-engine.md'),
      `---\nlinear_issue_id: "${sub}"\n---\n\n# Phase 1 — Engine ⬜\n\n**Goal:** go.\n\n- [x] Done earlier (${issue})\n`,
      'utf-8',
    )
    // Keyed by identifier — the bulk of a linked repo's refs live in here.
    fs.writeFileSync(
      path.join(base, `${issue}.base.json`),
      JSON.stringify({ issue: 'h', subIssues: { [sub]: 'deadbeef' } }),
      'utf-8',
    )
  }
  return dir
}

/**
 * A Linear where the team is now `ERQ` and `archivedCount` of its issues are
 * archived. `issue(id:)` resolves them all — the real API's behaviour, verified
 * against a live workspace — while `known` records what a bulk `team.issues`
 * query would have returned, so a regression to that approach is visible.
 */
function fakeLinear({ teamKey = 'ERQ', archived = new Set(), absent = new Set() } = {}) {
  const reads = []
  return {
    reads,
    async readTeam(id) {
      return { id, key: teamKey, name: 'eReqs' }
    },
    async readIssue(id) {
      reads.push(id)
      if (absent.has(id)) return null
      // Archived or not, an issue read by identifier resolves.
      return { id, identifier: id, archivedAt: archived.has(id) ? '2026-08-28T00:00:00Z' : null }
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

// --- the negative that matters ----------------------------------------------

test('a repo whose refs are almost all archived reports no missing refs', async () => {
  const dir = fixtureRepo({ specs: 3 })
  // Every ref resolves, and all but one is archived — the shape that made the
  // bulk query accuse a healthy repo.
  const all = ['ERQ-100', 'ERQ-101', 'ERQ-102', 'ERQ-103', 'ERQ-104', 'ERQ-105']
  const linear = fakeLinear({ archived: new Set(all.slice(1)) })
  const r = await run(['doctor'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0, 'read-only: reporting drift is not a failure')
  assert.match(r.out, /missing: 0 ref\(s\)/, 'archived refs are not missing refs')
  assert.doesNotMatch(r.out, /does not exist/)
})

test('it reads each drifted ref individually, never a bulk team listing', async () => {
  const dir = fixtureRepo({ specs: 3 })
  const linear = fakeLinear()
  await run(['doctor'], dir, { adapter: linear })
  assert.deepEqual(
    [...linear.reads].sort(),
    ['ERQ-100', 'ERQ-101', 'ERQ-102', 'ERQ-103', 'ERQ-104', 'ERQ-105'],
    'one read per distinct drifted ref, on the NEW key',
  )
})

// --- detection ---------------------------------------------------------------

test('it reports stamps, snapshots and the config key as drift', async () => {
  const dir = fixtureRepo({ specs: 3 })
  const r = await run(['doctor'], dir, { adapter: fakeLinear() })
  assert.match(r.out, /team ERQ/)
  assert.match(r.out, /stamps? still on REU|stamp\(s\) across/)
  assert.match(r.out, /6 distinct ref\(s\)/, '3 issues + 3 sub-issues')
  assert.match(r.out, /snapshots: 3 filename\(s\) \+ 3 sub-issue key\(s\)/)
  assert.match(r.out, /config linear\.teamKey = "REU"/)
  assert.match(r.out, /--write to repair/)
})

test('a genuinely absent ref is reported, separately from drift', async () => {
  const dir = fixtureRepo({ specs: 3 })
  const linear = fakeLinear({ absent: new Set(['ERQ-103']) })
  const r = await run(['doctor'], dir, { adapter: linear })
  assert.match(r.out, /missing: 1 ref\(s\)/)
  assert.match(r.out, /REU-103 → ERQ-103 does not exist/)
})

test('a repo already on the current key reports no drift', async () => {
  const dir = fixtureRepo({ stampKey: 'ERQ', configKey: 'ERQ' })
  const linear = fakeLinear()
  const r = await run(['doctor'], dir, { adapter: linear })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /drift:\s+none/)
  assert.deepEqual(linear.reads, [], 'nothing to check, so Linear is not read at all')
})

test('--json carries the drift and the missing set', async () => {
  const dir = fixtureRepo({ specs: 2 })
  const r = await run(['doctor', '--json'], dir, { adapter: fakeLinear({ absent: new Set(['ERQ-102']) }) })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.team.key, 'ERQ')
  assert.strictEqual(got.config.from, 'REU')
  assert.strictEqual(got.snapshots.length, 2)
  assert.deepEqual(got.missing, [{ from: 'REU-102', to: 'ERQ-102' }])
})

test('the linear_url is retargeted too, not just the identifier fields', async () => {
  const dir = fixtureRepo({ specs: 1 })
  const r = await run(['doctor', '--json'], dir, { adapter: fakeLinear() })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.urls.length, 1)
  assert.match(got.urls[0].to, /issue\/ERQ-100\//)
})

// --- refusals ----------------------------------------------------------------

test('it refuses over MCP rather than making one model round-trip per ref', async () => {
  const dir = fixtureRepo()
  const r = await run(['doctor', '--via', 'mcp'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /needs the api transport/)
  assert.match(r.out, /nothing was read/)
})

test('no key is a named refusal, not a silent clean bill', async () => {
  const dir = fixtureRepo()
  const r = await run(['doctor'], dir, { adapter: fakeLinear(), env: {} })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /LINEAR_API_KEY/)
  assert.doesNotMatch(r.out, /drift:\s+none/)
})

// --- the refs that do not live in frontmatter --------------------------------

test('it counts the identifier keys INSIDE each snapshot, not just the filename', async () => {
  const dir = fixtureRepo({ specs: 3 })
  const r = await run(['doctor', '--json'], dir, { adapter: fakeLinear() })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.snapshots.length, 3, 'three snapshot filenames')
  assert.strictEqual(got.snapshotKeys.length, 3, 'and three sub-issue keys inside them')
  assert.deepEqual(got.snapshotKeys[0], {
    file: 'specs/.core/linear-base/REU-100.base.json',
    from: 'REU-101',
    to: 'ERQ-101',
  })
})

test('prose mentions are reported but excluded from repair and from the ref checks', async () => {
  const dir = fixtureRepo({ specs: 2 })
  const linear = fakeLinear()
  const r = await run(['doctor'], dir, { adapter: linear })

  assert.match(r.out, /mentions: 2 stale ref\(s\) in spec prose/)
  assert.match(r.out, /NOT repaired by --write/, 'the report never implies --write fixes them')
  assert.strictEqual(linear.reads.length, 4, 'a prose mention costs no Linear read')
})

test('an unrelated identifier-shaped token in prose is not counted as drift', async () => {
  const dir = fixtureRepo({ specs: 1 })
  const stray = path.join(dir, 'specs', 'complete', 'feat-0', '02-notes.md')
  fs.writeFileSync(stray, '# Notes\n\nSee JIRA-42 and ABC-7 — neither is ours.\n', 'utf-8')
  const r = await run(['doctor', '--json'], dir, { adapter: fakeLinear() })
  const got = JSON.parse(r.out)
  assert.ok(
    got.mentions.every((m) => m.from.startsWith('REU-')),
    `only the repo's own stale key is counted, got ${JSON.stringify(got.mentions.map((m) => m.from))}`,
  )
})
