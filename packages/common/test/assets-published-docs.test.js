'use strict'

/**
 * The published docs are guarded the way the skills and the rules already are.
 *
 * WHY THIS FILE EXISTS. `assets-offer-last.test.js` asserts that `/spec-next`
 * stopped asking *"want a written review before you commit?"*, and
 * `assets-report-contract.test.js` asserts the contract that forbids it — so
 * the rules and the skills were guarded and the READMEs were not. They drifted
 * for exactly as long as that gap existed: the base README shipped a command
 * list missing two live commands, and both it and the docs site still printed
 * the removed question.
 *
 * TWO DIRECTIONS, because they catch opposite failures. A **positive** check
 * that everything shipped is documented catches something added and written up
 * nowhere. A **negative** check that removed names and removed behaviour are
 * gone catches the opposite. Neither substitutes for the other.
 *
 * AND THE POSITIVE HALF COMPARES SETS, not strings. A list of known-bad names
 * only ever catches the mistakes someone already made; comparing the documented
 * set against the shipped one found three commands nobody had thought to look
 * for — including one added the same day.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
const { DEFAULT_CONFIG } = require('../src/env/config.js')

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const names = (dir) => {
  try {
    return fs.readdirSync(path.join(ROOT, dir))
  } catch {
    return []
  }
}

// What each distribution actually ships, read off the tree rather than listed
// here. `build-dist.js` composes common's skills and commands into both, then
// overlays the provider's — so the superset's set is the union.
const BASE_SHIPS = [
  ...names('packages/common/assets/skills'),
  ...names('packages/common/assets/commands').map((f) => f.replace(/\.md$/, '')),
].sort()
const LINEAR_SHIPS = [...new Set([...BASE_SHIPS, ...names('packages/linear/assets/skills')])].sort()

/**
 * The commands a README presents as its reference, read from a MARKED REGION.
 *
 * WHY A REGION AND NOT THE WHOLE FILE. Scanning the prose was tried first and it
 * accuses correct writing in two ways at once. The base README names
 * `/spec-push` and `/spec-status` while explaining what the *superset* adds —
 * true, and not a claim that the base ships them. And its version history says
 * v3 removed `/spec-env`, `/spec-env-down` and `/spec-ready` — an accurate
 * record of a removal, read by a whole-file scan as three dead commands still
 * being documented. A set comparison needs a defined set on the document side,
 * or it is a guess about which prose is a reference.
 */
const REGION = /<!-- commands:start -->([\s\S]*?)<!-- commands:end -->/
// A command, never a path or a URL. The lookbehind rejects `rules/spec-planning`
// and `https://…/spec-foo`; `(?!\.md)` rejects a filename. Both are ordinary in
// these files and neither is a command reference.
const TOKEN = /(?<![\w./-])\/(spec[a-z-]*)\b(?!\.md)/g

function documented(file) {
  const text = read(file)
  const m = text.match(REGION)
  assert.ok(m, `${file} must carry a <!-- commands:start --> … <!-- commands:end --> region`)
  return [...new Set([...m[1].matchAll(TOKEN)].map((x) => x[1]))].sort()
}

const READMES = [
  ['packages/skitterspec/README.md', () => BASE_SHIPS],
  ['packages/skitterspec-linear/README.md', () => LINEAR_SHIPS],
]

// --- positive: everything shipped is documented ---------------------------

for (const [file, ships] of READMES) {
  test(`${file} documents exactly the commands it ships`, () => {
    const doc = documented(file)
    const shipped = ships()
    assert.deepStrictEqual(
      doc.filter((n) => !shipped.includes(n)),
      [],
      'documented but not shipped — a command that was removed, or a typo',
    )
    assert.deepStrictEqual(
      shipped.filter((n) => !doc.includes(n)),
      [],
      'shipped but undocumented — this is the half that let two live commands go unmentioned',
    )
  })
}

// Read from `DEFAULT_CONFIG.review` rather than listed here, so a new key fails
// this until someone writes it up. That is the whole point: the keys added the
// week this was written (`serve`, `allowNetwork`, `allowRemote`) are exactly the
// ones a hand-kept list would have missed.
test('every review.* config key is documented where a user reads it', () => {
  const keys = Object.keys(DEFAULT_CONFIG.review)
  assert.ok(keys.length >= 5, 'sanity: the keys were read, not defaulted to empty')
  const base = read('packages/skitterspec/README.md')
  const missing = keys.filter((k) => !base.includes(`review.${k}`))
  assert.deepStrictEqual(missing, [], 'a review.* key nobody wrote up')
})

// --- negative: removed behaviour, with a reason each -----------------------

/**
 * BANNED PROSE, and why each entry is here.
 *
 * This half is an explicit list and has to be: the stale `Review` row was
 * *prose*, not a command, so no set comparison can see it. The reason beside
 * each entry is what lets the next reader tell a dead phrase from a live one —
 * without it this list is a pile of strings nobody dares touch.
 */
const BANNED = [
  {
    phrase: 'want a written review before you commit?',
    why: 'the `Review` row asks nothing — a row cannot be waited on, so a question in one is unanswerable by construction (`spec-reports.md`, *asking implies waiting*)',
  },
  {
    phrase: 'serveOnRemote',
    why: 'renamed to `review.serve`; a legacy value is still read, but the key is not the one to document',
  },
  {
    phrase: '/spec-env-down',
    why: 'the skill was removed in v3 — teardown folded into `/spec-complete` and `/spec-cancel`. Naming it in version history is fine; naming it as a command is not',
  },
]

for (const [file] of READMES) {
  test(`${file} does not document behaviour that was removed`, () => {
    const text = read(file)
    const m = text.match(REGION)
    // The command region plus everything before the version history: that is
    // the part of the file claiming to describe the product NOW. A `## v3`
    // section recording what v3 removed is a record, not a claim.
    const cut = text.search(/^## (v\d|Migrating)/m)
    const current = (cut > 0 ? text.slice(0, cut) : text) + (m ? m[1] : '')
    for (const { phrase, why } of BANNED) {
      assert.ok(!current.includes(phrase), `${file} still says ${JSON.stringify(phrase)} — ${why}`)
    }
  })
}

// --- STAYS SILENT ---------------------------------------------------------

// The lookbehind earns its keep on these. `.claude/rules/spec-planning.md` and
// `.claude/rules/spec-reports.md` are named all over both files, and a scan that
// read them as `/spec-planning` and `/spec-reports` would accuse two commands
// that have never existed.
test('STAYS SILENT: a rule path is not read as a command', () => {
  const hit = (s) => [...s.matchAll(TOKEN)].map((m) => m[1])
  assert.deepStrictEqual(hit('see `.claude/rules/spec-planning.md` after install'), [])
  assert.deepStrictEqual(hit('`.claude/rules/spec-reports.md` carries the shape'), [])
  assert.deepStrictEqual(hit('https://example.invalid/spec-foo'), [])
  assert.deepStrictEqual(hit('packages/common/assets/skills/spec-next/SKILL.md'), [])
  // And it still finds a real one, in each shape these files use.
  assert.deepStrictEqual(hit('`/spec-next` builds it'), ['spec-next'])
  assert.deepStrictEqual(hit('| `/spec-diff` | read the diff |'), ['spec-diff'])
  assert.deepStrictEqual(hit('/spec  →  /spec-start'), ['spec', 'spec-start'])
})

// A version-history section is a RECORD of what changed, and the commonest thing
// it records is a removal. Reading it as current documentation would make an
// accurate changelog a test failure — and the fix would be to delete the
// history, which is the wrong direction entirely.
test('STAYS SILENT: version history may name a removed command', () => {
  const text = read('packages/skitterspec/README.md')
  const cut = text.search(/^## (v\d|Migrating)/m)
  assert.ok(cut > 0, 'the base README has a version history to be silent about')
  assert.match(text.slice(cut), /\/spec-env-down/, 'and it does name a removed skill')
  // The test above passes anyway, which is the assertion that matters.
})

// The set comparison must pass on a README that is CORRECT — otherwise the only
// way to a green suite is to stop shipping commands.
test('STAYS SILENT: a correct region passes both directions', () => {
  const region = '<!-- commands:start -->\n' + BASE_SHIPS.map((n) => `\`/${n}\``).join(' · ') + '\n<!-- commands:end -->'
  const doc = [...new Set([...region.matchAll(TOKEN)].map((x) => x[1]))].sort()
  assert.deepStrictEqual(doc, BASE_SHIPS)
})
