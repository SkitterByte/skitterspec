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
