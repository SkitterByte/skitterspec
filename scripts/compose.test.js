'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { seamNames, composeText, loadFragments, composeAssets } = require('./compose.js')

const COMMON_ASSETS = path.join(__dirname, '..', 'packages', 'common', 'assets')
const LINEAR_SEAMS = path.join(__dirname, '..', 'packages', 'linear', 'assets', 'seams')

// Every seam name declared across common's shipped markdown assets.
function commonSeamNames() {
  const names = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) {
        for (const n of seamNames(fs.readFileSync(abs, 'utf8'))) names.add(n)
      }
    }
  }
  walk(COMMON_ASSETS)
  return [...names]
}

// Collect every .md file's text under a directory.
function markdownTexts(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) out.push(fs.readFileSync(abs, 'utf8'))
    }
  }
  walk(dir)
  return out
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-compose-'))

// --- Unit: composeText / loadFragments -------------------------------------

test('composeText empties an unfilled seam and fills a provided one', () => {
  assert.strictEqual(composeText('a\n<!-- seam:x -->\nb'), 'a\n\nb')
  assert.strictEqual(composeText('a\n<!-- seam:x -->\nb', { x: 'HELLO' }), 'a\nHELLO\nb')
})

test('composeText leaves no raw marker even for unknown seams', () => {
  const out = composeText('<!-- seam:one -->\n<!-- seam:two -->', { one: 'X' })
  assert.doesNotMatch(out, /seam:/)
})

test('composeText is idempotent (composed output has no seams to refill)', () => {
  const once = composeText('p\n<!-- seam:x -->\nq', { x: 'FRAG' })
  assert.strictEqual(composeText(once, { x: 'FRAG' }), once)
})

test('loadFragments strips the leading doc comment and keys by filename', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'greet.md'), '<!--\nexplain this fragment\n-->\n\nHello **world**\n')
  const frags = loadFragments(dir)
  assert.deepStrictEqual(Object.keys(frags), ['greet'])
  assert.strictEqual(frags.greet, 'Hello **world**\n')
})

test('loadFragments returns nothing for a missing directory (base case)', () => {
  assert.deepStrictEqual(loadFragments(path.join(tmp(), 'nope')), {})
})

// --- Distribution builds ----------------------------------------------------

test('base build: seams emptied, no marker survives, no tracker leakage', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, {}) // no provider fragments = base
  const texts = markdownTexts(out)
  assert.ok(texts.length > 0, 'composed some markdown')
  for (const text of texts) {
    assert.doesNotMatch(text, /seam:/, 'no raw seam marker in the base build')
    assert.doesNotMatch(text, /Linear/, 'no Linear brand text in the base build')
    assert.doesNotMatch(text, /linear[_.]/i, 'no linear config/field tokens in the base build')
  }
})

test('base build copies non-markdown assets byte-for-byte', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, {})
  const example = path.join(out, 'core', 'env.config.json.example')
  assert.ok(fs.existsSync(example), 'env.config.json.example copied')
  assert.deepStrictEqual(
    fs.readFileSync(example),
    fs.readFileSync(path.join(COMMON_ASSETS, 'core', 'env.config.json.example')),
  )
})

test('superset build: both seams carry the Linear fragment', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, loadFragments(LINEAR_SEAMS))

  const spec = fs.readFileSync(path.join(out, 'skills', 'spec', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(spec, /seam:/, 'spec seam filled')
  assert.doesNotMatch(spec, /<!--|-->/, 'fragment doc comment stripped, no marker residue')
  assert.match(spec, /linear\.config\.json/, 'spec-tracker-link fragment injected')
  assert.match(spec, /Create the Project/i, 'link step present')
  assert.doesNotMatch(spec, /Seam fragment for/, 'fragment header text not injected')

  const specGo = fs.readFileSync(path.join(out, 'skills', 'spec-go', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(specGo, /seam:/, 'spec-go seam filled')
  assert.doesNotMatch(specGo, /<!--|-->/, 'fragment doc comment stripped, no marker residue')
  assert.match(specGo, /\/spec-pull/, 'spec-go-pull fragment injected')
})

// --- Guard: the seam contract between common and the provider ----------------

test('guard: the linear provider supplies a fragment for every common seam', () => {
  const declared = commonSeamNames()
  assert.ok(declared.length >= 2, 'common declares its seams')
  const provided = loadFragments(LINEAR_SEAMS)
  for (const name of declared) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(provided, name),
      `linear provides a fragment for seam:${name}`,
    )
  }
})
