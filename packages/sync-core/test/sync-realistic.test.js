'use strict'

// Phase 1 of one-way sync: the outbound projection building blocks, exercised
// against a REALISTIC spec fixture (hand-wrapped bullets, a multi-line goal,
// hyphenated compounds wrapped at the hyphen, `apps/**` globs in code spans, a
// table, a fenced block). This is the shape of real specs the earlier synthetic
// single-line fixtures never covered.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const {
  normalizeLocal,
  titleFromText,
  validateStates,
  canonicalizeMarkdown,
} = require('../src/normalize.js')
const { collapseHyphenAware, findTaskBlocks } = require('../src/task-block.js')
const { neutralConfig } = require('./_config.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'realistic-spec')

function config() {
  return neutralConfig() // {description, subIssues, workflowState}
}

// The fixture's task bullets, parsed (tasks are no longer projected, but the
// wrapped-bullet parser is still exercised here for its hyphen/wrap correctness).
function fixtureTaskText() {
  const body = fs.readFileSync(path.join(FIXTURE, '01-outbox.md'), 'utf-8')
  return findTaskBlocks(body.split('\n')).map((b) => b.text)
}

test('hyphenated compounds wrapped at the hyphen survive as one word', () => {
  const local = normalizeLocal(FIXTURE, config())
  const allTaskText = fixtureTaskText().join('\n')
  assert.match(allTaskText, /models-created-only/, 'task compound stays tight')
  assert.match(allTaskText, /state-entry-with-assignment/)
  assert.doesNotMatch(allTaskText, /models-created- only|state-entry-with- assignment/)

  // Goal compound too.
  assert.match(local.subIssues[0].goal, /hard-remove-after-ack/)
  assert.doesNotMatch(local.subIssues[0].goal, /hard-remove- after-ack/)

  // Description (pushed prose) compounds too.
  assert.match(local.description, /state-entry-with-assignment/)
  assert.match(local.description, /declares-rather-than-strips/)
  assert.doesNotMatch(local.description, /state-entry-with- assignment|declares-rather-than- strips/)
})

test('code-span globs and fenced blocks are preserved in the description', () => {
  const local = normalizeLocal(FIXTURE, config())
  assert.match(local.description, /`apps\/\*\*`/, 'inline code glob preserved')
})

test('titleFromText takes the first sentence, guarding versions and abbreviations', () => {
  assert.strictEqual(
    titleFromText('Add idempotencyKey with a unique index. Then cover it end to end.'),
    'Add idempotencyKey with a unique index',
  )
  // version/decimal not a sentence break
  assert.strictEqual(titleFromText('Bump to 7.0.2 in the manifest'), 'Bump to 7.0.2 in the manifest')
  // abbreviation not a sentence break
  assert.match(titleFromText('Support globs, e.g. apps/**, everywhere in scope'), /e\.g\. apps/)
  // no terminator, long → truncated at a word boundary within 100 chars
  const long = 'word '.repeat(40).trim()
  const t = titleFromText(long)
  assert.ok(t.length <= 100 && !t.endsWith(' '), t)
  assert.ok(long.startsWith(t))
})

test('titleFromText cuts at a clause boundary, not mid-phrase', () => {
  // a long first "sentence": prefer the `:` clause boundary over a hard char cut
  assert.strictEqual(
    titleFromText('Add the outbox to `schema.prisma`, modelled on `DbNotificationOutbox`: status, attempts, nextAttemptAt, payload'),
    'Add the outbox to `schema.prisma`, modelled on `DbNotificationOutbox`',
  )
  // never end on a dangling open bracket — drop the unclosed parenthetical
  const t = titleFromText('Slot the model into an audit bucket (`MODELS_CREATED_ONLY` — added columns) and mirror it in the injector too')
  assert.doesNotMatch(t, /\($/)
  assert.ok(!t.includes('(') || t.includes(')'), t)
})

test('titleFromText handles a numbered bold label without breaking the title', () => {
  // Two independent defects on `**1. Schema additions**`: the "1." was read as a
  // sentence boundary (cutting to "**1"), and the dangling "**" survived into the
  // plain-text title. Neither must happen — a Linear title is plain text.
  assert.strictEqual(
    titleFromText('**1. Schema additions** (`packages/api/prisma/schema.prisma`)'),
    '1. Schema additions (`packages/api/prisma/schema.prisma`)',
  )
  assert.strictEqual(titleFromText('**2. Token encryption util**'), '2. Token encryption util')
  // emphasis markers are stripped; backticks and snake_case identifiers are kept
  assert.strictEqual(titleFromText('Refactor the *whole* thing'), 'Refactor the whole thing')
  assert.strictEqual(titleFromText('Keep `DbFoo` and snake_case_ident intact'), 'Keep `DbFoo` and snake_case_ident intact')
  // a markdown link is unwrapped to its text
  assert.strictEqual(titleFromText('See the [design doc](https://x.example/y) here'), 'See the design doc here')
})

test('titleFromText on a real paragraph task reads as a one-liner', () => {
  const long = fixtureTaskText().find((t) => /first-class dedup/.test(t))
  assert.ok(long, 'found the paragraph task')
  const title = titleFromText(long)
  assert.ok(title.length <= 100, `title too long: ${title.length}`)
  assert.ok(!/\n/.test(title))
})

test('validateStates flags configured names absent from the workspace', () => {
  const cfg = { states: { backlog: 'Backlog', 'in-progress': 'In Progress', complete: 'Completed', cancelled: 'Canceled' } }
  assert.deepStrictEqual(validateStates(cfg, ['Backlog', 'Planned', 'In Progress', 'Completed', 'Canceled']), [])
  // the OLD wrong defaults (issue names) would be flagged
  const wrong = { states: { complete: 'Done', cancelled: 'Cancelled' } }
  assert.deepStrictEqual(
    validateStates(wrong, ['Backlog', 'In Progress', 'Completed', 'Canceled']).sort(),
    ['Cancelled', 'Done'],
  )
})

test('collapseHyphenAware and canonicalizeMarkdown agree on soft hyphens', () => {
  assert.strictEqual(collapseHyphenAware('a state-entry-with-\nassignment b'), 'a state-entry-with-assignment b')
  assert.strictEqual(collapseHyphenAware('plain wrap\nhere'), 'plain wrap here')
  assert.strictEqual(canonicalizeMarkdown('a hard-remove-\nafter-ack policy'), 'a hard-remove-after-ack policy')
})
