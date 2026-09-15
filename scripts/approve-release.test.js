'use strict'

// The approve helper resolves a version to a STAGE-ID, because every npm stage
// subcommand except `list` takes a UUID and rejects a package spec outright
// (`stage-id must be a valid UUID`). That resolution is the whole risk surface:
// npm's docs do not pin down the field names in `npm stage list --json`, so the
// parser accepts several spellings and, failing all of them, scans for a
// UUID-shaped value.
//
// The thing it must never do is turn a payload it could not read into
// "nothing is staged" and then into "the release failed". An unreadable listing
// and an empty one are the same output here, so the caller reports both as
// unknown — see `.claude/rules/negative-checks.md` rule 1.

const { test } = require('node:test')
const assert = require('node:assert')
const {
  parseArgs,
  tooOld,
  normaliseEntries,
  resolveStageId,
  resolvePackage,
  UUID,
} = require('./approve-release.cjs')

const ID_A = '097ace7b-131c-48d1-aa2d-1aed8243a758'
const ID_B = 'b2c3d4e5-6789-4abc-8def-0123456789ab'

// --- argument handling ------------------------------------------------------

test('parseArgs takes a package, an optional target, and --reject', () => {
  assert.deepStrictEqual(parseArgs(['n', 'n', 'skitterspec']), {
    action: 'approve',
    pkg: 'skitterspec',
    target: undefined,
  })
  assert.deepStrictEqual(parseArgs(['n', 'n', 'skitterspec', '19.0.0']), {
    action: 'approve',
    pkg: 'skitterspec',
    target: '19.0.0',
  })
  assert.strictEqual(parseArgs(['n', 'n', 'skitterspec', '--reject']).action, 'reject')
})

test('resolvePackage accepts the two publishable names and nothing else', () => {
  assert.strictEqual(resolvePackage('skitterspec').npm, '@skitterbyte/skitterspec')
  assert.strictEqual(resolvePackage('skitterspec-linear').npm, '@skitterbyte/skitterspec-linear')
  // A private workspace package is not publishable, so it is not approvable.
  assert.strictEqual(resolvePackage('common'), null)
  assert.strictEqual(resolvePackage(''), null)
  assert.strictEqual(resolvePackage(undefined), null)
})

test('the npm floor is a numeric comparison, not a string one', () => {
  assert.strictEqual(tooOld([11, 15, 0], [11, 15, 0]), false)
  assert.strictEqual(tooOld([11, 9, 0], [11, 15, 0]), true, '11.9 < 11.15')
  assert.strictEqual(tooOld([12, 0, 0], [11, 15, 0]), false)
  assert.strictEqual(tooOld([10, 9, 2], [11, 15, 0]), true)
})

// --- parsing the listing ----------------------------------------------------

test('a version resolves to its stage-id', () => {
  const rows = normaliseEntries([
    { id: ID_A, version: '19.0.0' },
    { id: ID_B, version: '18.0.0' },
  ])
  assert.strictEqual(resolveStageId(rows, '19.0.0').id, ID_A)
  assert.strictEqual(resolveStageId(rows, '18.0.0').id, ID_B)
})

test('each plausible field spelling is accepted', () => {
  for (const key of ['id', 'stageId', 'stage_id', 'stageID']) {
    const rows = normaliseEntries([{ [key]: ID_A, version: '19.0.0' }])
    assert.strictEqual(rows[0].id, ID_A, `${key} should be read`)
  }
})

test('an unknown field name still yields the id, by shape', () => {
  // The defensive fallback: no documented spelling matched, so scan the row.
  const rows = normaliseEntries([{ someFutureName: ID_A, version: '19.0.0' }])
  assert.strictEqual(rows[0].id, ID_A)
})

test('a version is recovered from a spec when there is no version field', () => {
  const rows = normaliseEntries([{ id: ID_A, spec: '@skitterbyte/skitterspec@19.0.0' }])
  assert.strictEqual(rows[0].version, '19.0.0', 'split on the LAST @, so the scope survives')
})

test('a wrapped payload is unwrapped', () => {
  for (const key of ['staged', 'versions', 'stages']) {
    const rows = normaliseEntries({ [key]: [{ id: ID_A, version: '19.0.0' }] })
    assert.strictEqual(rows.length, 1, `${key} wrapper should be unwrapped`)
  }
})

// --- it refuses rather than guessing ----------------------------------------

test('a version with no staged entry refuses, and does not fall back', () => {
  const rows = normaliseEntries([{ id: ID_A, version: '18.0.0' }])
  const found = resolveStageId(rows, '19.0.0')
  assert.strictEqual(found.problem, 'none')
  assert.strictEqual(found.id, undefined, 'never "the only one" — that is the bug this avoids')
})

test('two entries for one version refuse rather than picking', () => {
  const rows = normaliseEntries([
    { id: ID_A, version: '19.0.0' },
    { id: ID_B, version: '19.0.0' },
  ])
  const found = resolveStageId(rows, '19.0.0')
  assert.strictEqual(found.problem, 'ambiguous')
  assert.strictEqual(found.matches.length, 2)
})

test('an unreadable payload yields no rows, never a wrong row', () => {
  assert.deepStrictEqual(normaliseEntries(null), [])
  assert.deepStrictEqual(normaliseEntries('not json-ish'), [])
  assert.deepStrictEqual(normaliseEntries(42), [])
  // A row with no UUID anywhere is dropped rather than approved blindly.
  assert.deepStrictEqual(normaliseEntries([{ version: '19.0.0' }]), [])
})

test('UUID matching is strict enough to reject a package spec', () => {
  // `npm stage approve @skitterbyte/skitterspec@19.0.0` fails with
  // `stage-id must be a valid UUID`, so a spec must never be taken for an id.
  assert.ok(UUID.test(ID_A))
  assert.ok(!UUID.test('@skitterbyte/skitterspec@19.0.0'))
  assert.ok(!UUID.test('19.0.0'))
  assert.ok(!UUID.test('097ace7b131c48d1aa2d1aed8243a758'), 'no hyphens is not a UUID')
})
