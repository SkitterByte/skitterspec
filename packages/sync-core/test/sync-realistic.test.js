'use strict'

// Phase 1 of one-way sync: the outbound projection building blocks, exercised
// against a REALISTIC spec fixture (hand-wrapped bullets, a multi-line goal,
// hyphenated compounds wrapped at the hyphen, `apps/**` globs in code spans, a
// table, a fenced block). This is the shape of real specs the earlier synthetic
// single-line fixtures never covered.

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const {
  normalizeLocal,
  titleFromText,
  validateStates,
  canonicalizeMarkdown,
} = require('../src/normalize.js')
const { collapseHyphenAware } = require('../src/task-block.js')
const { neutralConfig } = require('./_config.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'realistic-spec')

function config() {
  const c = neutralConfig()
  for (const k of ['phaseBodies', 'acceptanceCriteria', 'taskBreakdown']) delete c.sync.fieldOwnership[k]
  c.sync.fieldOwnership.tasks = 'both'
  c.sync.fieldOwnership.milestones = 'both'
  c.sync.keyedFields = { tasks: 'id', milestones: 'id' }
  return c
}

test('hyphenated compounds wrapped at the hyphen survive as one word', () => {
  const local = normalizeLocal(FIXTURE, config())
  const allTaskText = local.tasks.map((t) => t.description).join('\n')
  assert.match(allTaskText, /models-created-only/, 'task compound stays tight')
  assert.match(allTaskText, /state-entry-with-assignment/)
  assert.doesNotMatch(allTaskText, /models-created- only|state-entry-with- assignment/)

  // Goal compound too.
  assert.match(local.milestones[0].goal, /hard-remove-after-ack/)
  assert.doesNotMatch(local.milestones[0].goal, /hard-remove- after-ack/)

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

test('titleFromText on a real paragraph task reads as a one-liner', () => {
  const local = normalizeLocal(FIXTURE, config())
  const long = local.tasks.find((t) => /first-class dedup/.test(t.description))
  assert.ok(long, 'found the paragraph task')
  const title = titleFromText(long.description)
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
