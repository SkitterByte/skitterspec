'use strict'

/**
 * `remoteDescriptionEdited` — did somebody other than this repo change the
 * tracker's description since the last push?
 *
 * ONE-WAY SYNC IS NOT WEAKENED BY THIS. Nothing here merges, writes, or feeds a
 * projection; the only output is a boolean for a human to act on. The repo still
 * wins on the next push — it just stops winning silently.
 *
 * THE RISK THIS FILE EXISTS FOR IS THE FALSE POSITIVE. Linear reserialises
 * markdown on save, so the obvious implementation — compare the exact
 * description hash against a read-back — would report an edit on every intact
 * mirror in the workspace, on every run. More than half the tests below feed it
 * a HEALTHY input and assert it says nothing, which is the pairing
 * `.claude/rules/negative-checks.md` rule 3 demands of any check that accuses.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { snapshotOf, remoteDescriptionEdited, planChanges, isEmptyPlan, hashField, stream } = require('../index.js')

const DESCRIPTION = [
  '# Export timeouts',
  '',
  '## Problem',
  '',
  'Exports time out on large accounts.',
  '',
  '- Chrome 121',
  '- only over 50k rows',
  '',
  '1. open reports',
  '2. click export',
  '',
  '| Surface | Change |',
  '|---------|--------|',
  '| Endpoint | add |',
].join('\n')

// What the repo would record after pushing that description.
const snapshotFor = (description) => snapshotOf({ description, status: 'in-progress', subIssues: [] })

// --- it can fire -------------------------------------------------------------

test('a genuinely edited description is reported', () => {
  const snap = snapshotFor(DESCRIPTION)
  const edited = DESCRIPTION + '\n\nAlso: it only happens after a CSV import.'
  assert.strictEqual(remoteDescriptionEdited(snap, { description: edited }), true)
})

test('an unchanged description is not', () => {
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(remoteDescriptionEdited(snap, { description: DESCRIPTION }), false)
})

test('text deleted from the description counts as an edit', () => {
  const snap = snapshotFor(DESCRIPTION)
  const trimmed = DESCRIPTION.replace('- only over 50k rows\n', '')
  assert.strictEqual(remoteDescriptionEdited(snap, { description: trimmed }), true)
})

// --- stays silent: the tracker's own reformatting is not an edit -------------

test('Linear reserialising the markdown is NOT an edit', () => {
  // Every transform here is one Linear actually performs on save. An exact hash
  // would call all of them a human edit, on a mirror nobody has touched — which
  // would make the check fire at everyone and therefore mean nothing.
  const snap = snapshotFor(DESCRIPTION)
  const reserialised = DESCRIPTION.split('\n')
    .map((line) =>
      line
        // unordered markers come back as `*`
        .replace(/^- /, '* ')
        // ordered lists get renumbered
        .replace(/^1\. /, '3. ')
        .replace(/^2\. /, '4. ')
        // table separator rows collapse
        .replace(/^\|-+\|-+\|$/, '| --- | --- |'),
    )
    .join('\n')
    // trailing whitespace trimmed, blank runs collapsed
    .replace(/\n\n/g, '\n\n\n')
    .trimEnd()

  assert.notStrictEqual(reserialised, DESCRIPTION, 'the fixture really was reformatted')
  assert.strictEqual(
    remoteDescriptionEdited(snap, { description: reserialised }),
    false,
    'a reformatted-but-intact mirror must say nothing',
  )
})

test('CRLF from a different client is not an edit either', () => {
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(remoteDescriptionEdited(snap, { description: DESCRIPTION.replace(/\n/g, '\r\n') }), false)
})

// --- stays silent: every cannot-tell is null, never true --------------------

test('a snapshot written before this existed is cannot-tell, not an edit', () => {
  // THE BLIND SPOT THAT MATTERS MOST. Every snapshot in every repo predates this
  // field, so reading its absence as evidence would accuse every spec on the
  // first run after upgrading — the exact failure mode the three incidents in
  // negative-checks.md share.
  const old = { issue: 'abc', issueFields: { description: 'abc', state: 'def' }, subIssues: {} }
  assert.strictEqual(remoteDescriptionEdited(old, { description: 'anything at all' }), null)
})

test('no snapshot at all is cannot-tell', () => {
  assert.strictEqual(remoteDescriptionEdited(null, { description: DESCRIPTION }), null)
})

test('a snapshot with no issueFields is cannot-tell', () => {
  assert.strictEqual(remoteDescriptionEdited({ issue: 'abc' }, { description: DESCRIPTION }), null)
})

test('an issueFields that is not an object is cannot-tell, not a crash', () => {
  for (const bad of [[], 'abc', 0]) {
    assert.strictEqual(remoteDescriptionEdited({ issueFields: bad }, { description: 'x' }), null)
  }
})

test('a remote with no description key is cannot-tell — it was never asked for', () => {
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(remoteDescriptionEdited(snap, { state: { name: 'In Progress' } }), null)
})

test('a description that is not a string is cannot-tell, never "emptied"', () => {
  // The blind spot compareStored documents: a value the caller never fetched is
  // indistinguishable from one the tracker really holds empty. Reporting the
  // second would be an accusation built on the first.
  const snap = snapshotFor(DESCRIPTION)
  for (const bad of [null, undefined, 0, {}]) {
    assert.strictEqual(remoteDescriptionEdited(snap, { description: bad }), null, `${JSON.stringify(bad)}`)
  }
})

test('no remote at all is cannot-tell', () => {
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(remoteDescriptionEdited(snap, null), null)
  assert.strictEqual(remoteDescriptionEdited(snap, undefined), null)
})

test('a description the tracker really does hold empty is reported, once we know', () => {
  // The other side of the line above: an empty STRING was read back, so this is
  // evidence — someone cleared it — where a missing key would not be.
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(remoteDescriptionEdited(snap, { description: '' }), true)
})

// --- the recorded hash must not leak into planning --------------------------

test('recording the stream hash cannot make a push pending', () => {
  // `issueChanges` reads description/state/assignee by name and never iterates
  // issueFields, so a new key is inert there. Pinned, because the cost of being
  // wrong is every spec in the repo planning an update forever.
  const projection = { description: DESCRIPTION, status: 'in-progress', subIssues: [] }
  const snap = snapshotOf(projection)
  const plan = planChanges(projection, snap)
  // `isEmptyPlan` rather than poking at `plan.issue`: an unchanged issue is
  // OMITTED from the plan, not set to null, and asserting the wrong shape would
  // pass for the wrong reason the moment that changed.
  assert.ok(isEmptyPlan(plan), 'nothing to push after recording')
})

test('the snapshot still carries the exact description hash beside the stream one', () => {
  // They answer different questions and both are needed: the exact one decides
  // what to push, the stream one decides whether someone else has been here.
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(typeof snap.issueFields.description, 'string')
  assert.strictEqual(typeof snap.issueFields.descriptionStream, 'string')
  assert.notStrictEqual(
    snap.issueFields.description,
    snap.issueFields.descriptionStream,
    'the two hashes are of different reductions',
  )
})

test('the stream hash is exactly what the exported reduction produces', () => {
  // So a provider can compute the comparison itself without guessing at the
  // recipe — which is what stops a second, disagreeing implementation appearing.
  const snap = snapshotFor(DESCRIPTION)
  assert.strictEqual(snap.issueFields.descriptionStream, hashField(stream(DESCRIPTION)))
})

test('a spec with no description records a stream hash rather than omitting it', () => {
  // An omitted key would read as "old snapshot" forever, so this spec could
  // never be checked. Hashing the empty stream keeps the field a positive signal.
  const snap = snapshotFor(null)
  assert.strictEqual(snap.issueFields.descriptionStream, hashField(stream('')))
  assert.strictEqual(remoteDescriptionEdited(snap, { description: '' }), false)
})

// --- the known limit, stated rather than discovered -------------------------

test('a punctuation-only edit is invisible, and that is the accepted trade', () => {
  // `stream` keeps letters and digits only, so this is the mirror image of the
  // false positive it prevents. Pinned so the limit is a decision on the record
  // rather than a surprise: the alternative is accusing every intact mirror.
  const snap = snapshotFor(DESCRIPTION)
  const repunctuated = DESCRIPTION.replace('Exports time out on large accounts.', 'Exports time out on large accounts!!')
  assert.strictEqual(remoteDescriptionEdited(snap, { description: repunctuated }), false)
})
