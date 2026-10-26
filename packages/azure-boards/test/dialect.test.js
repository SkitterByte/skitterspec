'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { dialect, canonicalizeMarkdown, htmlToText, looksLikeHtml } = require('../src/dialect.js')

test('canonicalize unifies bullets, strips trailing space, collapses blank runs', () => {
  const input = '* one  \n+ two\n\n\n\n- three\t\n'
  assert.strictEqual(canonicalizeMarkdown(input), '- one\n- two\n\n- three')
})

test('canonicalize is identity on already-canonical markdown', () => {
  const md = '## Problem\n\n- [ ] task one\n- [x] task two\n\n**bold** and `code`'
  assert.strictEqual(canonicalizeMarkdown(md), md)
})

test('flattenTables is identity — markdown is stored verbatim, nothing to reshape for', () => {
  const md = '- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |'
  assert.strictEqual(dialect.flattenTables(md), md)
})

test('htmlToText reduces an HTML-era description to readable text', () => {
  const html = '<div>First line<br/>second line</div><ul><li>one</li><li>two &amp; three</li></ul>'
  assert.strictEqual(htmlToText(html), 'First line\nsecond line\n\n- one\n- two & three')
})

test('htmlToText decodes numeric entities and nbsp', () => {
  assert.strictEqual(htmlToText('<p>a&nbsp;b &#8212; c</p>'), 'a b — c')
})

test('looksLikeHtml fires on tags and stays silent on markdown', () => {
  assert.ok(looksLikeHtml('<div>hi</div>'))
  assert.ok(looksLikeHtml('line<br>line'))
  // The stays-silent half: healthy markdown — including angle brackets in
  // code and autolinks — is not accused of being HTML.
  assert.ok(!looksLikeHtml('## Heading\n\n- [ ] a < b and b > c\n`<not-a-known-tag>`'))
  assert.ok(!looksLikeHtml('plain text with a > quote'))
})

// --- the adoption handoff fixes (bug-azure-boards-adoption-fixes) -------------

// What Azure DevOps actually does to a stored markdown description, observed
// live (AB#57, AB#194): tag-shaped tokens are stripped — even inside backtick
// code spans — and stray HTML specials are entity-encoded.
function azureStores(text) {
  return text
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const { compareStored } = require('@skitterbyte/skitterspec-sync-core')

const SENT = [
  '# A body with every special Azure rewrites',
  '',
  '> a blockquote line',
  '',
  'It is "quoted", a < b, fish & chips, the user\'s own words,',
  'and a `specs/<bucket>/<name>/00-overview.md` path.',
  '',
  '```js',
  'if (a < b && c > d) say("both")',
  '```',
].join('\n')

test('a stored round-trip through Azure\'s encoding verifies clean', () => {
  const r = compareStored(SENT, azureStores(SENT), { dialect })
  assert.strictEqual(r.ok, true, `first difference at ${r.at}: ${r.sentContext} vs ${r.storedContext}`)
})

test('a real Boards-side edit is still reported', () => {
  const edited = azureStores(SENT).replace('chips', 'chipolatas')
  const r = compareStored(SENT, edited, { dialect })
  assert.strictEqual(r.ok, false)
})
