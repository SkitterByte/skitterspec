'use strict'

// One-time spec sanitiser: rewrite files so no emphasis/link span straddles a
// line break, and repair Linear-mangled `****` artifacts. Minimal-diff and
// idempotent.

const { test } = require('node:test')
const assert = require('node:assert')
const { sanitizeSpecMarkdown } = require('../src/sanitise.js')

// Re-uses the straddle detector from the sibling test would be circular; inline a
// simple per-line check: no line may carry an unbalanced ** / * / [ ].
function straddles(line) {
  const s = line.replace(/`[^`]*`/g, '')
  if ((s.match(/\*\*/g) || []).length % 2 !== 0) return true
  if ((s.replace(/\*\*/g, '').match(/\*/g) || []).length % 2 !== 0) return true
  return (s.match(/\[/g) || []).length !== (s.match(/\]/g) || []).length
}
const noStraddle = (text) => text.split('\n').every((l) => !straddles(l))

test('joins a bold span that a task bullet split across lines', () => {
  const src = [
    '- [x] Slot the model into an audit bucket **and mirror it in the test-side',
    '      injector** which is the real trap here (REU-8)',
  ].join('\n')
  const { text, changed, fixes } = sanitizeSpecMarkdown(src)
  assert.strictEqual(changed, true)
  assert.strictEqual(fixes, 1)
  assert.ok(noStraddle(text), text)
  assert.match(text, /\*\*and mirror it in the test-side injector\*\*/)
})

test('repairs a Linear-mangled bold artifact in prose', () => {
  const src = 'We must handle **the bold text that wraps****\n****across a line** cleanly here.'
  const { text, changed } = sanitizeSpecMarkdown(src)
  assert.strictEqual(changed, true)
  assert.ok(noStraddle(text), text)
  assert.doesNotMatch(text, /\*\*\*\*/, 'the **** artifact must be gone')
  assert.match(text, /\*\*the bold text that wraps across a line\*\*/)
})

test('leaves clean paragraphs, tables, code, and headings byte-untouched', () => {
  const src = [
    '# Heading with **inline bold** on one line',
    '',
    'A clean paragraph wrapped by hand',
    'across two lines with no straddle.',
    '',
    '| col | **bold** in a cell |',
    '| --- | ------------------ |',
    '',
    '```',
    'code **with a\nstraddle** stays verbatim',
    '```',
  ].join('\n')
  const { text, changed, fixes } = sanitizeSpecMarkdown(src)
  assert.strictEqual(changed, false, 'no straddles → no change')
  assert.strictEqual(fixes, 0)
  assert.strictEqual(text, src)
})

test('is idempotent — a second pass is a no-op', () => {
  const src = [
    '- [ ] a task with **a bold run that the author wrapped',
    '      onto a second line** and then more trailing words here to fill it out',
    '',
    'Prose with *italic that also crosses',
    'a line* and keeps going for a while afterwards to force a wrap boundary.',
  ].join('\n')
  const first = sanitizeSpecMarkdown(src)
  assert.strictEqual(first.changed, true)
  assert.ok(noStraddle(first.text), first.text)
  const second = sanitizeSpecMarkdown(first.text)
  assert.strictEqual(second.changed, false)
  assert.strictEqual(second.text, first.text)
})

test('a pipe inside inline code does not shield a list from sanitising', () => {
  // Items 1..2 form one blank-free block; item 2 carries a `|` inside code. That
  // must NOT make the whole block read as a table and skip item 1's straddle.
  const src = [
    '1. First item with *italic that the author wrapped',
    '   onto a second line* and trailing words here to fill it.',
    '2. Second item mentions the `<a|b|c>` CLI grammar inline.',
  ].join('\n')
  const { text, changed, fixes } = sanitizeSpecMarkdown(src)
  assert.strictEqual(changed, true)
  assert.strictEqual(fixes, 1)
  assert.ok(noStraddle(text), text)
  assert.match(text, /\*italic that the author wrapped onto a second line\*/)
  assert.match(text, /`<a\|b\|c>`/, 'the inline-code pipe is preserved')
})

test('a real GFM table is left untouched', () => {
  const src = ['| a | b |', '| --- | --- |', '| *x | y* |'].join('\n')
  const { changed, text } = sanitizeSpecMarkdown(src)
  assert.strictEqual(changed, false)
  assert.strictEqual(text, src)
})

test('preserves indent and marker of a nested bullet it reflows', () => {
  const src = [
    '  - [ ] nested **bold that wraps here',
    '        onto the next line** trailing',
  ].join('\n')
  const { text } = sanitizeSpecMarkdown(src)
  assert.ok(noStraddle(text), text)
  assert.ok(text.split('\n').every((l) => l.startsWith('  ')), text)
  assert.match(text, /^ {2}- \[ \] /m)
})
