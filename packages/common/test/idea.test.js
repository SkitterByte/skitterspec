'use strict'

/**
 * The pure half of ideas: the `specs/ideas.md` format, ids, the add/drop
 * planners, and which store holds ideas.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { parseIdeas, formatIdeas, ideaId, planAdd, planDrop, selectStore, splitText } = require('../src/idea.js')

const ADD = { author: 'Ada', date: '2026-01-02' }

test('an add on an empty file writes the preamble and one entry', () => {
  const plan = planAdd('', { ...ADD, text: 'Rate-limit the review server\nIt answers anyone on the LAN.' })
  assert.strictEqual(plan.id, 'rate-limit-the-review-server')
  assert.match(plan.content, /^# Ideas\n/)
  assert.match(plan.content, /\n## rate-limit-the-review-server · 2026-01-02 · Ada\nRate-limit the review server\nIt answers anyone on the LAN\.\n$/)
  assert.match(plan.message, /^docs\(ideas\): add rate-limit-the-review-server\n/)
})

test('the format round-trips, preamble included', () => {
  const once = planAdd('', { ...ADD, text: 'First' }).content
  const twice = planAdd(once, { ...ADD, text: 'Second\nwith a body' }).content
  const parsed = parseIdeas(twice)
  assert.deepStrictEqual(
    parsed.entries.map((e) => [e.id, e.title, e.body]),
    [
      ['first', 'First', ''],
      ['second', 'Second', 'with a body'],
    ],
  )
  assert.strictEqual(formatIdeas(parsed), twice)
})

test('a hand-written preamble is kept verbatim', () => {
  const current = '# Our parking lot\n\nAnything goes.\n'
  const plan = planAdd(current, { ...ADD, text: 'Thing' })
  assert.match(plan.content, /^# Our parking lot\n\nAnything goes\.\n\n## thing · /)
})

test('ids are short, kebab-case and unique', () => {
  assert.strictEqual(ideaId('Hello, World!'), 'hello-world')
  assert.ok(ideaId('a very long title that goes on and on past the limit').length <= 30)
  assert.strictEqual(ideaId('Hello world', ['hello-world']), 'hello-world-2')
  assert.strictEqual(ideaId('Hello world', ['hello-world', 'hello-world-2']), 'hello-world-3')
  assert.strictEqual(ideaId('!!!'), 'idea')
  assert.ok(ideaId('x'.repeat(80)).length <= 30)
})

test('the commit subject stays within 50 characters', () => {
  const plan = planAdd('', { ...ADD, text: 'an extraordinarily verbose title for a small idea indeed' })
  assert.ok(plan.message.split('\n')[0].length <= 50, plan.message.split('\n')[0])
})

test('a body line that looks like a heading cannot become an entry', () => {
  const plan = planAdd('', { ...ADD, text: 'Title\n## not a header' })
  const parsed = parseIdeas(plan.content)
  assert.strictEqual(parsed.entries.length, 1)
  assert.deepStrictEqual(parsed.malformed, [])
})

test('a heading the parser does not understand refuses the write', () => {
  const current = planAdd('', { ...ADD, text: 'One' }).content + '\n## a hand-added note\n'
  assert.match(planAdd(current, { ...ADD, text: 'Two' }).refused, /not idea entries/)
  assert.match(planDrop(current, { id: 'one' }).refused, /not idea entries/)
})

test('an add with no text refuses', () => {
  assert.match(planAdd('', { ...ADD, text: '  \n ' }).refused, /nothing to capture/)
})

test('a drop removes the entry and records the reason in the commit', () => {
  const current = planAdd(planAdd('', { ...ADD, text: 'One' }).content, { ...ADD, text: 'Two' }).content
  const plan = planDrop(current, { id: 'one', reason: 'done elsewhere' })
  assert.deepStrictEqual(parseIdeas(plan.content).entries.map((e) => e.id), ['two'])
  assert.match(plan.message, /^docs\(ideas\): drop one\n\n- Discard "One": done elsewhere\n$/)
})

test('a drop of an unknown id refuses', () => {
  assert.match(planDrop('', { id: 'nope' }).refused, /no idea "nope"/)
})

test('splitText takes the first non-empty line as the title', () => {
  assert.deepStrictEqual(splitText('\n\n  Title  \nbody\n'), { title: 'Title', body: 'body' })
})

test('the file is chosen only on a positive answer', () => {
  assert.strictEqual(selectStore({ providerConfigured: false }), 'file')
  assert.strictEqual(selectStore({ providerConfigured: true, store: { supports: false } }), 'file')
  assert.strictEqual(selectStore({ providerConfigured: true, store: { supports: true } }), 'provider')
  // A configured provider that said nothing is unknown, never the file.
  assert.strictEqual(selectStore({ providerConfigured: true }), 'unknown')
  assert.strictEqual(selectStore({ providerConfigured: true, store: {} }), 'unknown')
})
