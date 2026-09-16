'use strict'

/**
 * `spec-sync reattach` — point a spec back at the issue it already has.
 *
 * A spec whose `linear_identifier` is gone had no way back: the next push read
 * it as unlinked and minted a second issue over the top of a perfectly good
 * one. That is not hypothetical. A stray `sed '1s/…'` clobbered the opening
 * `---` of a phase file's frontmatter after it had been stamped, orphaning
 * `linear_issue_id: "SKS-283"` into the body — and the next push created
 * **SKS-284** beside the live SKS-283, which had to be cancelled by hand.
 *
 * TWO HALVES, and both come from that incident: finding the orphan, and
 * refusing to mint over it.
 *
 * THE MATCH IS EXACT, NEVER FUZZY. A near-match is not evidence, and refusing a
 * mint on one would block a legitimate spec that merely reads similarly
 * (`.claude/rules/negative-checks.md` rule 1). The cost is that a **renamed**
 * spec is not found — which `--to` answers, and which is written down rather
 * than discovered.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const STATES = [
  { id: 's-backlog', name: 'Backlog' },
  { id: 's-progress', name: 'In Progress' },
  { id: 's-done', name: 'Done' },
]

function fixtureRepo({ stamped = false, extra = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reattach-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-applied')
  fs.mkdirSync(folder, { recursive: true })
  const front = stamped ? '---\nlinear_identifier: "SKI-9"\nlinear_url: "https://x/SKI-9"\n---\n\n' : ''
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    `${front}# Applied\n\n## Problem\n\nGone.\n\n## Phases\n\n` +
      '| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n', 'utf-8')

  // Other specs, so "already claimed by another spec" is constructible.
  for (const { name, identifier } of extra) {
    const f = path.join(dir, 'specs', 'in-progress', name)
    fs.mkdirSync(f, { recursive: true })
    fs.writeFileSync(
      path.join(f, '00-overview.md'),
      `---\nlinear_identifier: "${identifier}"\n---\n\n# ${name}\n`,
      'utf-8',
    )
  }
  return dir
}

const overview = (dir) =>
  fs.readFileSync(path.join(dir, 'specs/in-progress/feat-applied/00-overview.md'), 'utf-8')
const phase = (dir) =>
  fs.readFileSync(path.join(dir, 'specs/in-progress/feat-applied/01-engine.md'), 'utf-8')

// A Linear holding `issues`, each `{ identifier, title, children }`.
function fakeLinear(issues = []) {
  const log = []
  return {
    log,
    async listIssueStates() {
      return STATES
    },
    async searchIssues({ query, teamId } = {}) {
      log.push({ op: 'searchIssues', query, teamId })
      return issues.filter((i) => !query || i.title.toLowerCase().includes(String(query).toLowerCase()))
    },
    async readIssue(id) {
      return issues.find((i) => i.identifier === id) || null
    },
    async listSubIssues(parentId) {
      const parent = issues.find((i) => i.identifier === parentId || i.id === parentId)
      return (parent && parent.children) || []
    },
  }
}

const issue = (identifier, title, children = []) => ({
  id: `uuid-${identifier}`,
  identifier,
  title,
  url: `https://linear.app/x/${identifier}`,
  children,
})

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

// --- the three answers, and only one acts -----------------------------------

test('one unclaimed candidate is stamped', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKI-9', 'Applied')])
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: linear })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /SKI-9/)
  assert.match(overview(dir), /linear_identifier: "?SKI-9"?/)
})

test('several candidates refuse and name them, never picking', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKI-9', 'Applied'), issue('SKI-10', 'Applied')])
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: linear })
  assert.notStrictEqual(r.code, 0)
  assert.match(r.out, /SKI-9/)
  assert.match(r.out, /SKI-10/)
  assert.doesNotMatch(overview(dir), /linear_identifier/, 'and nothing was written')
})

test('no candidate says so and writes nothing', async () => {
  const dir = fixtureRepo()
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: fakeLinear([]) })
  assert.notStrictEqual(r.code, 0)
  assert.match(r.out, /no unclaimed issue/i)
  assert.doesNotMatch(overview(dir), /linear_identifier/)
})

// The candidate set is what NO spec already holds. An issue another spec is
// linked to is not an orphan — it is someone's live mirror.
test('an identifier another spec claims is not a candidate', async () => {
  const dir = fixtureRepo({ extra: [{ name: 'feat-other', identifier: 'SKI-9' }] })
  const linear = fakeLinear([issue('SKI-9', 'Applied'), issue('SKI-11', 'Applied')])
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, 'one candidate remains, so it acts')
  assert.match(overview(dir), /SKI-11/, 'the one nobody holds')
  assert.doesNotMatch(overview(dir), /SKI-9/)
})

test('--to names one exactly and skips the search', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKI-42', 'A completely different title')])
  const r = await run(['reattach', 'feat-applied', '--to', 'SKI-42'], dir, { adapter: linear })
  assert.strictEqual(r.code, 0)
  assert.match(overview(dir), /SKI-42/)
  assert.deepStrictEqual(linear.log.filter((c) => c.op === 'searchIssues'), [], 'it never searched')
})

// A spec issue with unlinked phases is half a link: the next push mints a
// sub-issue per phase beside the ones already there — the SKS-284 failure one
// level down.
test('it re-attaches the phases too, matching children by title', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKI-9', 'Applied', [issue('SKI-10', 'Engine')])])
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: linear })
  assert.strictEqual(r.code, 0)
  assert.match(phase(dir), /linear_issue_id: "?SKI-10"?/)
})

test('a phase whose child is ambiguous is left alone, and said so', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    issue('SKI-9', 'Applied', [issue('SKI-10', 'Engine'), issue('SKI-11', 'Engine')]),
  ])
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, 'the spec issue still attaches')
  assert.match(overview(dir), /SKI-9/)
  assert.doesNotMatch(phase(dir), /linear_issue_id/, 'the ambiguous phase is not guessed at')
  assert.match(r.out, /01-engine/, 'and it is named rather than silently skipped')
})

// THE ONE COMMAND WHOSE SHAPE MAKES A PULL TEMPTING. It writes an id and
// nothing else: no title, no description, no state. The repo stays the source
// of truth and the next push overwrites the mirror.
test('it reads content back into nothing — an id is all it writes', async () => {
  const dir = fixtureRepo()
  const before = overview(dir)
  const linear = fakeLinear([issue('SKI-9', 'A TITLE THE SPEC DOES NOT HAVE')])
  await run(['reattach', 'feat-applied', '--to', 'SKI-9'], dir, { adapter: linear })
  const after = overview(dir)
  assert.match(after, /SKI-9/)
  assert.doesNotMatch(after, /A TITLE THE SPEC DOES NOT HAVE/, 'no title pulled in')
  assert.ok(after.includes('## Problem\n\nGone.'), 'the body is untouched')
  assert.strictEqual(before.includes('# Applied'), after.includes('# Applied'))
})

// STAYS SILENT (rule 3): a spec that is already linked is not broken.
test('stays silent: an already-linked spec is refused, not re-pointed', async () => {
  const dir = fixtureRepo({ stamped: true })
  const r = await run(['reattach', 'feat-applied'], dir, { adapter: fakeLinear([issue('SKI-9', 'Applied')]) })
  assert.notStrictEqual(r.code, 0)
  assert.match(r.out, /already linked/i)
  assert.match(overview(dir), /SKI-9/, 'and its existing link is untouched')
})

// --- the other half: refuse to mint over an unclaimed match ------------------
//
// Finding the orphan is only useful if something stops you creating a twin
// first. This is the guard that would have prevented SKS-284: the push was
// minting because the spec read as unlinked, while SKS-283 sat there unclaimed
// with exactly this title.

const CREATE_PLAN = {
  issue: { description: '# Applied\n\n## Problem\n\nGone.', state: 'in-progress' },
  subIssues: { create: [], update: [] },
}

function planFile(dir, plan) {
  const file = path.join(dir, 'plan.json')
  fs.writeFileSync(file, JSON.stringify({ ...plan, title: 'Applied' }), 'utf-8')
  return file
}

function mintingLinear(existing = []) {
  const base = fakeLinear(existing)
  const log = base.log
  let seq = 100
  return {
    ...base,
    log,
    async createIssue(input) {
      log.push({ op: 'createIssue', input })
      seq++
      return { id: `uuid-${seq}`, identifier: `SKI-${seq}`, url: 'u', description: input.description }
    },
    async createSubIssue(parentId, input) {
      return this.createIssue({ ...input, parentId })
    },
    async updateIssue(id, input) {
      log.push({ op: 'updateIssue', id, input })
      return { id, identifier: id, ...input }
    },
  }
}

test('minting refuses over an unclaimed issue with the same title', async () => {
  const dir = fixtureRepo()
  const linear = mintingLinear([issue('SKI-9', 'Applied')])
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.notStrictEqual(r.code, 0)
  assert.match(r.out, /SKI-9/, 'it names what already exists')
  assert.match(r.out, /reattach/, 'and the way to adopt it')
  assert.deepStrictEqual(linear.log.filter((c) => c.op === 'createIssue'), [], 'nothing was minted')
})

test('--force-new mints anyway, for a genuine duplicate title', async () => {
  const dir = fixtureRepo()
  const linear = mintingLinear([issue('SKI-9', 'Applied')])
  const r = await run(
    ['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN), '--force-new'],
    dir,
    { adapter: linear },
  )
  assert.strictEqual(r.code, 0)
  assert.strictEqual(linear.log.filter((c) => c.op === 'createIssue').length, 1)
})

// STAYS SILENT (rule 3), and this is the half that matters most: being wrong
// here BLOCKS a legitimate push. A near-match is not evidence.
test('stays silent: a similar title is not a match, and the mint proceeds', async () => {
  const dir = fixtureRepo()
  const linear = mintingLinear([issue('SKI-9', 'Applied to something else entirely')])
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, 'a near-match must never block a mint')
  assert.strictEqual(linear.log.filter((c) => c.op === 'createIssue').length, 1)
})

test('stays silent: an exact title another spec already claims is not a collision', async () => {
  const dir = fixtureRepo({ extra: [{ name: 'feat-other', identifier: 'SKI-9' }] })
  const linear = mintingLinear([issue('SKI-9', 'Applied')])
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, 'it is somebody else\'s live mirror, not an orphan')
  assert.strictEqual(linear.log.filter((c) => c.op === 'createIssue').length, 1)
})

test('stays silent: an update is never checked for collisions', async () => {
  const dir = fixtureRepo({ stamped: true })
  const linear = mintingLinear([issue('SKI-9', 'Applied'), issue('SKI-20', 'Applied')])
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, 'a linked spec pushes as it always did')
})
