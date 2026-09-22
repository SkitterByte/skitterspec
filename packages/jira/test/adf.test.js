'use strict'

// The round-trip contract `adf.js` owes: no word gained, none lost, in order —
// `stream(adfToText(mdToAdf(md))) === stream(md)` (see the module header for
// why the bar is word-level rather than byte-level).

const { test } = require('node:test')
const assert = require('node:assert')

const { mdToAdf, adfToText } = require('../src/adf.js')

const stream = (t) => String(t == null ? '' : t).replace(/[^\p{L}\p{N}]/gu, '')
const roundTrip = (md) => stream(adfToText(mdToAdf(md)))

const CASES = {
  heading: '# One\n\n###### Six deep',
  paragraph: 'A plain paragraph\nsoft-wrapped onto a second line.',
  emphasis: 'Some **bold**, some *em*, some `inline code`, and **bold with *nested em* inside**.',
  link: 'Read [the docs](https://example.invalid/path?q=1) first.',
  bullets: '- one\n- two\n  - nested two point one\n- three',
  ordered: '1. first\n2. second\n3. third',
  tasks: '- [ ] open task with **bold**\n- [x] finished task',
  fence: '```js\nconst x = 1\nif (x) { call(x) }\n```',
  table: '| Col A | Col B |\n|-------|-------|\n| a1 | b1 |\n| a2 | b2 |',
  quote: '> quoted line one\n> quoted **two**',
  mixed: [
    '# Spec title',
    '',
    '## Problem',
    '',
    'One paragraph with `code` and [a link](https://x.y).',
    '',
    '## Tasks',
    '',
    '- [ ] Add the outbox table',
    '- [x] Wire the enqueue path',
    '',
    '```sql',
    'SELECT 1;',
    '```',
  ].join('\n'),
}

for (const [name, md] of Object.entries(CASES)) {
  test(`round-trips ${name} with no word lost`, () => {
    assert.strictEqual(roundTrip(md), stream(md))
  })
}

test('checkbox state survives the round trip', () => {
  const back = adfToText(mdToAdf('- [ ] open\n- [x] done'))
  assert.match(back, /- \[ \] open/)
  assert.match(back, /- \[x\] done/)
})

test('checklists render as live ADF task lists', () => {
  const adf = mdToAdf('- [ ] open\n- [x] done')
  const list = adf.content[0]
  assert.strictEqual(list.type, 'taskList')
  assert.strictEqual(list.content[0].type, 'taskItem')
  assert.strictEqual(list.content[0].attrs.state, 'TODO')
  assert.strictEqual(list.content[1].attrs.state, 'DONE')
})

test('adfToText renders an unknown block by its children rather than dropping words', () => {
  const doc = {
    type: 'doc',
    content: [{ type: 'panel', attrs: { panelType: 'info' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep these words' }] }] }],
  }
  assert.match(adfToText(doc), /keep these words/)
})

test('adfToText handles hardBreak, mention and emoji text', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'before' },
          { type: 'hardBreak' },
          { type: 'mention', attrs: { id: 'u1', text: '@Jane' } },
          { type: 'text', text: 'after' },
        ],
      },
    ],
  }
  const out = adfToText(doc)
  assert.match(out, /before/)
  assert.match(out, /@Jane/)
  assert.match(out, /after/)
})

test('media nodes reduce to nothing rather than noise', () => {
  const doc = { type: 'doc', content: [{ type: 'mediaGroup', content: [{ type: 'media', attrs: {} }] }] }
  assert.strictEqual(adfToText(doc), '')
})

test('a null or string input is safe', () => {
  assert.strictEqual(adfToText(null), '')
  assert.strictEqual(adfToText('already text'), 'already text')
})

test('the taskLists:false fallback renders checklists as bullets, words intact', () => {
  const adf = mdToAdf('- [ ] open\n- [x] done', { taskLists: false })
  assert.strictEqual(adf.content[0].type, 'bulletList')
  const back = adfToText(adf)
  assert.match(back, /\[ \] open/)
  assert.match(back, /\[x\] done/)
})
