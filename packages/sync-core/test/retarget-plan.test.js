'use strict'

/**
 * `retarget.js` — the pure prefix move, planned but not applied.
 *
 * The sharpest constraint here is a NEGATIVE one: prose must come back
 * byte-identical. A naive repo-wide `SKI-` → `SKS-` substitution passes a casual
 * eyeball and quietly rewrites the historical record, which the project's own
 * rules forbid. Frontmatter-only is the whole rule, so the fixtures deliberately
 * carry an identifier in prose, in a doc placeholder, and in a heading.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { planRetarget, deriveRecordedKey, isEmptyRetarget, movePrefix } = require('../src/retarget.js')

const CONFIG = (teamKey = 'SKI') => ({
  linear: { teamId: 'T1', teamKey },
  sync: { baseDir: 'specs/.core/linear-base' },
})

// A spec whose frontmatter is stamped and whose BODY mentions identifiers that
// must survive untouched.
const OVERVIEW = `---
linear_identifier: "SKI-7"
linear_url: "https://linear.app/acme/issue/SKI-7/safer-init"
---

# Safer init

Probe SKI-28 falsified the reported hypothesis, and SKI-7 is this spec.
A doc placeholder like SKI-123 is illustrative, not a stamp.
`

const PHASE = `---
linear_issue_id: "SKI-8"
---

# Phase 1 — Engine ⬜

**Goal:** go. Superseded by SKI-99 per the changelog.
`

function fixtureRepo({ teamKey = 'SKI', snapshots = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-retarget-'))
  const folder = path.join(dir, 'specs', 'complete', 'feat-safer-init')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(folder, '01-engine.md'), PHASE, 'utf-8')
  if (snapshots) {
    const base = path.join(dir, 'specs', '.core', 'linear-base')
    fs.mkdirSync(base, { recursive: true })
    fs.writeFileSync(
      path.join(base, 'SKI-7.base.json'),
      JSON.stringify({ issue: 'aaaa1111', subIssues: { 'SKI-8': 'bbbb2222' } }, null, 2) + '\n',
      'utf-8',
    )
  }
  return { dir, config: CONFIG(teamKey) }
}

const planOf = (f, oldKey = 'SKI', newKey = 'SKS') =>
  planRetarget({ dir: f.dir, oldKey, newKey, config: f.config })
const stampFor = (plan, name) => plan.stamps.find((s) => s.file.endsWith(name))

// --- the negative that matters ----------------------------------------------

test('prose carrying the old key is left byte-identical', () => {
  const plan = planOf(fixtureRepo())
  const overview = stampFor(plan, '00-overview.md')
  const body = overview.to.slice(overview.to.indexOf('\n---\n', 4) + 5)

  assert.match(body, /Probe SKI-28 falsified/, 'a prose mention is history, not a stamp')
  assert.match(body, /SKI-7 is this spec/, 'even the spec\'s own id in prose stays put')
  assert.match(body, /SKI-123 is illustrative/, 'and a doc placeholder is not ours to move')
  assert.doesNotMatch(body, /SKS-/, 'nothing after the frontmatter block moved')

  // Byte-for-byte against the original body, not just pattern-wise.
  const original = OVERVIEW.slice(OVERVIEW.indexOf('\n---\n', 4) + 5)
  assert.strictEqual(body, original)
})

test('a phase body mention survives too, while its stamp moves', () => {
  const plan = planOf(fixtureRepo())
  const phase = stampFor(plan, '01-engine.md')
  assert.match(phase.to, /linear_issue_id: "SKS-8"/, 'the stamp moved')
  assert.match(phase.to, /Superseded by SKI-99/, 'the prose did not')
})

// --- the frontmatter rewrite -------------------------------------------------

test('all three stamped fields move, and the url keeps its slug', () => {
  const plan = planOf(fixtureRepo())
  const overview = stampFor(plan, '00-overview.md')
  const head = overview.to.slice(0, overview.to.indexOf('\n---\n', 4) + 5)
  assert.match(head, /linear_identifier: "SKS-7"/)
  assert.match(head, /linear_url: "https:\/\/linear\.app\/acme\/issue\/SKS-7\/safer-init"/)
  assert.doesNotMatch(head, /SKI-/, 'no stamp of the old key survives in the frontmatter')
})

test('an identifier under a different key is not touched', () => {
  const f = fixtureRepo()
  fs.writeFileSync(
    path.join(f.dir, 'specs', 'complete', 'feat-safer-init', '02-other.md'),
    '---\nlinear_issue_id: "OTHER-3"\n---\n\n# Phase 2\n',
    'utf-8',
  )
  const plan = planOf(f)
  assert.strictEqual(stampFor(plan, '02-other.md'), undefined, 'a foreign key is not ours to move')
})

test('a file with no frontmatter is skipped entirely', () => {
  const f = fixtureRepo()
  fs.writeFileSync(path.join(f.dir, 'specs', 'complete', 'feat-safer-init', 'notes.md'), '# Notes\n\nSKI-7 here.\n', 'utf-8')
  assert.strictEqual(stampFor(planOf(f), 'notes.md'), undefined)
})

test('a lowercased identifier in a url path is moved, and stays lowercase', () => {
  // Linear writes the identifier lowercased into the URL path. Matching only
  // uppercase left 29 of 33 real urls in ~/code/ereqs on the old key — the same
  // ones the hand-repair missed, because they do not look like stamps.
  const f = fixtureRepo()
  fs.writeFileSync(
    path.join(f.dir, 'specs', 'complete', 'feat-safer-init', '04-url.md'),
    '---\nlinear_issue_id: "SKI-9"\nlinear_url: "https://linear.app/acme/issue/ski-9/retire-dead-mechanism"\n---\n\n# Phase 4\n',
    'utf-8',
  )
  const head = (() => {
    const st = stampFor(planOf(f), '04-url.md')
    return st.to.slice(0, st.to.indexOf('\n---\n', 4) + 5)
  })()
  assert.match(head, /issue\/sks-9\/retire-dead-mechanism/, 'moved, and still lowercase')
  assert.match(head, /linear_issue_id: "SKS-9"/, 'while the uppercase stamp stays uppercase')
})

test('a token that merely looks like an identifier is not touched', () => {
  // Case-insensitive matching widens what the regex sees, so this pins the rule
  // that only the OLD KEY is ever rewritten.
  assert.strictEqual(movePrefix('charset utf-8 and iso-8859 and SKI-7', 'SKI', 'SKS'), 'charset utf-8 and iso-8859 and SKS-7')
})

// --- snapshots ---------------------------------------------------------------

test('a snapshot is renamed and its subIssues re-keyed, hashes preserved', () => {
  const plan = planOf(fixtureRepo())
  assert.strictEqual(plan.snapshots.length, 1)
  const [s] = plan.snapshots
  assert.strictEqual(s.from, 'SKI-7.base.json')
  assert.strictEqual(s.to, 'SKS-7.base.json')
  assert.deepEqual(Object.keys(s.keys), ['SKS-8'], 'the key inside moved')
  assert.strictEqual(s.keys['SKS-8'], 'bbbb2222', 'the hash is content-derived and survives')
  assert.strictEqual(s.body.issue, 'aaaa1111', 'as does the spec-issue hash')
})

test('the config key is planned only when it is actually stale', () => {
  assert.deepEqual(planOf(fixtureRepo()).configKey, { from: 'SKI', to: 'SKS' })
  assert.strictEqual(planOf(fixtureRepo({ teamKey: 'SKS' }), 'SKI', 'SKS').configKey, null)
})

test('a repo already on the new key plans nothing', () => {
  const f = fixtureRepo({ teamKey: 'SKS' })
  assert.ok(isEmptyRetarget(planRetarget({ dir: f.dir, oldKey: 'SKS', newKey: 'SKS', config: f.config })))
})

// --- deriveRecordedKey -------------------------------------------------------

test('the config teamKey wins when it is set', () => {
  assert.deepEqual(deriveRecordedKey(fixtureRepo().dir, CONFIG('SKI')), { key: 'SKI', source: 'config' })
})

test('an empty teamKey falls back to the prefix observed in the stamps', () => {
  const f = fixtureRepo({ teamKey: '' })
  assert.deepEqual(deriveRecordedKey(f.dir, f.config), { key: 'SKI', source: 'stamps' })
})

test('disagreeing stamps are reported, never guessed at', () => {
  const f = fixtureRepo({ teamKey: '' })
  fs.writeFileSync(
    path.join(f.dir, 'specs', 'complete', 'feat-safer-init', '03-mixed.md'),
    '---\nlinear_issue_id: "OTHER-3"\n---\n\n# Phase 3\n',
    'utf-8',
  )
  const got = deriveRecordedKey(f.dir, f.config)
  assert.strictEqual(got.key, null, 'no key is chosen')
  assert.deepEqual(got.keys, ['OTHER', 'SKI'])
  assert.match(got.reason, /disagree/)
})

test('a repo with no stamps at all reports that, rather than throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-retarget-empty-'))
  const got = deriveRecordedKey(dir, CONFIG(''))
  assert.strictEqual(got.key, null)
  assert.deepEqual(got.keys, [])
  assert.match(got.reason, /no stamped identifiers/)
})

// --- the primitive -----------------------------------------------------------

test('movePrefix preserves the number and ignores other keys', () => {
  assert.strictEqual(movePrefix('SKI-7 and SKI-1234 and ABC-7', 'SKI', 'SKS'), 'SKS-7 and SKS-1234 and ABC-7')
})
