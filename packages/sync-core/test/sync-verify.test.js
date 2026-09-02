'use strict'

// Read-back verification: catch a tracker that silently drops characters, while
// staying quiet through every reformat it legitimately applies on save.

const { test } = require('node:test')
const assert = require('node:assert')
const { compareStored } = require('../src/verify.js')

const SENT = [
  '# Spec',
  '',
  '## Decisions',
  '',
  '6. **Auth is two headers.**',
  '',
  '   - `X-Extraction-Key` — shared secret, from Key Vault',
  '',
  '## Tasks',
  '',
  '- [x] Ship it',
  '- [ ] Verify it',
].join('\n')

test('an exact round-trip is clean', () => {
  assert.strictEqual(compareStored(SENT, SENT).ok, true)
})

test('a dropped character is caught and located', () => {
  const stored = SENT.replace('`X-Extraction-Key`', '`Extraction-Key`')
  const r = compareStored(SENT, stored)
  assert.strictEqual(r.ok, false)
  // 1, not 2: `X-` loses both characters but only `X` is a word character —
  // the hyphen was never in the reduced stream to begin with.
  assert.strictEqual(r.lost, 1)
  assert.match(r.sentContext, /XExtractionKey/)
  assert.ok(!/XExtractionKey/.test(r.storedContext), 'the stored side shows the damage')
})

test('the real corruption from the field is caught', () => {
  // Every data cell lost its first 3 characters on the actual push.
  const sent = '| `X-Extraction-Key` | shared secret, from Key Vault |'
  const stored = '| Extraction-Key` | red secret, from Key Vault |'
  assert.strictEqual(compareStored(sent, stored).ok, false)
})

test('ordered-list renumbering does NOT trigger it', () => {
  // The reporter's proposed rule — compare alphanumeric streams — fails here:
  // renumbering rewrites digits, and digits are alphanumeric. This is the case
  // that forced marker normalisation.
  const stored = SENT.replace('6. **Auth', '2. **Auth')
  assert.strictEqual(compareStored(SENT, stored).ok, true, 'renumbering is benign')
})

test('digits outside a list marker are still significant', () => {
  const sent = 'Listens on port 8443 with a 256-bit key.'
  const stored = 'Listens on port 843 with a 256-bit key.'
  assert.strictEqual(compareStored(sent, stored).ok, false, 'a lost digit is real loss')
})

test('bullet rewriting, separator collapse and checkbox case are benign', () => {
  const stored = SENT.replace(/^- /gm, '* ').replace('- [x]', '* [X]')
  assert.strictEqual(compareStored(SENT, stored).ok, true)
  assert.strictEqual(compareStored('| a | b |\n|-----|-----|', '| a | b |\n| -- | -- |').ok, true)
})

test('bold boundary shifts around inline code are benign', () => {
  const sent = 'The **`X-Key`** header'
  const stored = 'The **`X-Key`** header'.replace('**`', '** `').replace('`**', '` **')
  assert.strictEqual(compareStored(sent, stored).ok, true)
})

test('blank-run collapse and trailing whitespace are benign', () => {
  const stored = SENT.replace(/\n\n/g, '\n\n\n').replace(/$/gm, '  ')
  assert.strictEqual(compareStored(SENT, stored).ok, true)
})

test('an empty stored description against real content is caught', () => {
  const r = compareStored(SENT, '')
  assert.strictEqual(r.ok, false)
  assert.ok(r.lost > 0)
})

// --- stays silent on the reformatting the tracker legitimately applies -------
//
// Each of these is an intact mirror. A false positive here tells the user their
// content was lost when it wasn't, on a push that worked.
// See `.claude/rules/negative-checks.md`.

test('a `+` bullet coming back as `*` is benign', () => {
  // The marker set the normaliser accepts is `*`, `+` and `-`; the first two had
  // no test, so a narrower regex would have passed review.
  const sent = '+ first\n+ second'
  assert.strictEqual(compareStored(sent, '* first\n* second').ok, true)
})

test('re-indenting a nested list is benign', () => {
  // Linear rewrites nesting depth in spaces. Indentation is whitespace, which
  // the reduced stream drops entirely — this pins that it stays dropped.
  const sent = '- outer\n  - inner\n    - deeper'
  assert.strictEqual(compareStored(sent, '- outer\n    - inner\n        - deeper').ok, true)
})

test('a heading rewritten with a trailing hash run is benign', () => {
  assert.strictEqual(compareStored('## Decisions', '## Decisions ##').ok, true)
})

test('an empty description on both sides is intact, not lost', () => {
  // A phase with no goal sends ''. Comparing nothing to nothing must report
  // clean rather than dividing by an absence.
  assert.strictEqual(compareStored('', '').ok, true)
  assert.strictEqual(compareStored(null, null).ok, true)
})

test('a whole word dropped from the middle is still reported', () => {
  // The counterweight: every benign transform above is normalised away, so this
  // proves the normalising did not hollow the check out.
  const sent = 'The extraction key is rotated every ninety days.'
  const r = compareStored(sent, 'The extraction key is rotated days.')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.lost, 'everyninety'.length)
})
