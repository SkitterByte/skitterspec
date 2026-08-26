'use strict'

// Bug: Linear round-trip corrupts markdown emphasis that spans a line break.
//
// Linear normalises markdown on save and mangles inline emphasis (**bold**,
// *italic*, [link](url)) whose markers straddle a hard line break — e.g.
// `**a\nb**` comes back as `**a****\n****b**`. Two defects:
//
//   A — renderTaskBlock wraps on word boundaries with no regard for emphasis
//       spans, so re-wrapping a task *manufactures* a straddling span.
//   B — nothing canonicalises the mangled form, so an already-mangled remote
//       reports as a spurious `remote-only` diff and /spec-pull writes the
//       `****` artifacts into the source of truth.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { renderTaskBlock, findTaskBlocks, inferWidth } = require('../src/task-block.js')
const { normalizeLocal, normalizeRemote, canonicalizeMarkdown } = require('../src/normalize.js')
const { classify, hashField } = require('../src/compare.js')
const { neutralConfig } = require('./_config.js')

// A line "straddles" if an emphasis/link marker opens on it and doesn't close on
// the same line: an odd number of `**`, an odd number of lone `*`, or an
// unbalanced `[`…`]`. Code spans (backticks) are stripped first — they're allowed
// to cross lines and their contents don't count.
function straddles(line) {
  const s = line.replace(/`[^`]*`/g, '')
  const bold = (s.match(/\*\*/g) || []).length
  if (bold % 2 !== 0) return true
  const italics = (s.replace(/\*\*/g, '').match(/\*/g) || []).length
  if (italics % 2 !== 0) return true
  const open = (s.match(/\[/g) || []).length
  const close = (s.match(/\]/g) || []).length
  return open !== close
}

// --- Defect A: renderTaskBlock must never manufacture a straddling span ------

test('A: renderTaskBlock does not split a bold span across a line break', () => {
  const text =
    'Slot the model into an audit bucket in `src/config/database.ts` ' +
    '(**MODELS_CREATED_ONLY** — added columns) **and mirror it in the ' +
    'test-side injector** which is the real trap here'
  const lines = renderTaskBlock({ indent: '', done: true, id: 'REU-8', text })
  const bad = lines.filter(straddles)
  assert.deepStrictEqual(bad, [], `no rendered line may straddle a span:\n${lines.join('\n')}`)
})

test('A: an over-width single span overflows rather than being split', () => {
  // One bold span longer than the wrap width — it must stay whole on one line.
  const text = 'prefix **' + 'reallylongword '.repeat(8).trim() + '** suffix'
  const lines = renderTaskBlock({ indent: '', done: false, text }, 40)
  assert.deepStrictEqual(lines.filter(straddles), [], lines.join('\n'))
})

test('A: a link is never split across a line break', () => {
  const text =
    'see the [design doc for the whole outbox subsystem](https://example.com/doc) ' +
    'for the full rationale and the follow-up work items listed at the bottom'
  const lines = renderTaskBlock({ indent: '', done: false, text }, 60)
  assert.deepStrictEqual(lines.filter(straddles), [], lines.join('\n'))
})

test('A: render → parse → render is stable and straddle-free', () => {
  const text =
    'first **bold spanning several words here** then *italic also spanning a ' +
    'few words* and a [link with long text](https://example.com/x) at the end'
  const a = renderTaskBlock({ indent: '', done: false, id: 'SKI-9', text }, 72)
  const [block] = findTaskBlocks(a)
  const b = renderTaskBlock({ indent: '', done: false, id: 'SKI-9', text: block.text.replace(/\s*\(SKI-9\)$/, '') }, 72)
  assert.deepStrictEqual(b, a, 'render is a fixed point once parsed back')
  assert.deepStrictEqual(a.filter(straddles), [], a.join('\n'))
})

// --- inferWidth: a wide table row must not inflate the prose wrap column ------

test('inferWidth ignores table rows and infers the prose width', () => {
  const prose = 'prose wrapped at roughly eighty columns here and it keeps going yes'
  const lines = [
    prose,
    prose,
    '| a | very | wide | table | row | far | longer | than | the | prose | width | wow |',
  ]
  const w = inferWidth(lines)
  assert.ok(w < 80, `expected the prose width, not the table row's; got ${w}`)
  assert.strictEqual(w, Math.max(60, prose.length))
})

// --- Defect B: canonicalize the mangled form on both sides -------------------

test('B: canonicalizeMarkdown joins a clean straddling bold span', () => {
  assert.strictEqual(canonicalizeMarkdown('x **a\nb** y'), 'x **a b** y')
})

test('B: canonicalizeMarkdown repairs Linear-mangled bold/italic', () => {
  assert.strictEqual(canonicalizeMarkdown('**bold crossing****\n****a break**'), '**bold crossing a break**')
  assert.strictEqual(canonicalizeMarkdown('*italic crossing**\n**a break*'), '*italic crossing a break*')
})

test('B: canonicalizeMarkdown is idempotent on clean and mangled input', () => {
  for (const s of ['x **a\nb** y', 'x **a****\n****b** y', '*i**\n**t*', 'plain text\n\nsecond para']) {
    const once = canonicalizeMarkdown(s)
    assert.strictEqual(canonicalizeMarkdown(once), once, `not idempotent: ${JSON.stringify(s)}`)
  }
})

test('B: a mangled remote hashes equal to the clean local (no spurious diff)', () => {
  assert.strictEqual(
    hashField(canonicalizeMarkdown('x **a****\n****b** y')),
    hashField(canonicalizeMarkdown('x **a\nb** y')),
  )
})

// The full pipeline: a local spec with a straddling bold span, and a remote
// whose description came back mangled, must classify as in-sync — not the
// dangerous `remote-only`/`pullable` that writes `****` into the repo.
test('B: normalize + classify treats clean-local vs mangled-remote as in sync', () => {
  const config = neutralConfig()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emphasis-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '# Demo\n\n## Problem\n\nWe must handle **the bold text that wraps\nacross a line** cleanly.\n',
    'utf-8',
  )
  const local = normalizeLocal(dir, config)
  const remote = normalizeRemote(
    { description: '# Demo\n\n## Problem\n\nWe must handle **the bold text that wraps****\n****across a line** cleanly.' },
    config,
  )
  const fields = classify(local, remote, local, config)
  const desc = fields.find((f) => f.field === 'description')
  assert.strictEqual(desc.status, 'unchanged', `expected in-sync, got ${desc.status}`)
  assert.strictEqual(desc.pullable, false, 'a mangled remote must not be pullable into the repo')
})
