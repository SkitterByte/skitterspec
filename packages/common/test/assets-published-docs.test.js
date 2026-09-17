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

const PROVIDER_SHIPS = names('packages/linear/assets/skills').sort()

/**
 * Every published surface, and which set each one's region is held to.
 *
 * THE TWO SUPERSET SURFACES ARE HELD TO DIFFERENT SETS, and the difference is
 * about who reads them rather than about consistency. The superset **README**
 * is the only document inside that npm package, so someone who installs it and
 * reads nothing else must find all 21 commands there — it is the whole product.
 * `docs/linear.html` sits beside `docs/index.html` on one site and links to it,
 * so its job is the Linear half; demanding it restate the base's fifteen would
 * make it a worse page, not a more complete one.
 */
const READMES = [
  ['packages/skitterspec/README.md', () => BASE_SHIPS],
  ['packages/skitterspec-linear/README.md', () => LINEAR_SHIPS],
  ['docs/index.html', () => BASE_SHIPS],
  ['docs/linear.html', () => PROVIDER_SHIPS],
  // NOT PUBLISHED TO NPM, and under the guard anyway. The phase that added it
  // was allowed to conclude "not this file" — a check that fires on a history
  // section would be the same over-reach this whole spec is fixing. It does not
  // apply: this file had no history section, and presented two skills removed in
  // v3 as the live "manual engine", in a fenced block someone would copy. That
  // is the exact failure the guard is for, so the file is held to the base set
  // like any other, and its one historical sentence lives outside the region.
  ['packages/common/README.md', () => BASE_SHIPS],
]

// --- positive: everything shipped is documented ---------------------------

/**
 * THE TWO HALVES ARE SCOPED DIFFERENTLY, and it took a real false positive to
 * see why.
 *
 * *Shipped but undocumented* is checked **per surface**: whatever this document
 * is responsible for listing, it must list all of. That is the half that let
 * two live commands go unmentioned.
 *
 * *Documented but not shipped* is checked against the **union** of everything
 * every distribution ships — because a name in a region that ships SOMEWHERE is
 * a real command, and cross-referencing one is ordinary writing. `linear.html`'s
 * `/spec-list` card says the folder name is what you paste into
 * `/spec-start <name>`, which is true and useful; reading that as "the provider
 * claims to ship `/spec-start`" would force the page to be written around the
 * test. What this half is actually for is a name that exists nowhere at all — a
 * command that was removed, or a typo.
 */
const SHIPS_ANYWHERE = [...new Set([...LINEAR_SHIPS, ...BASE_SHIPS])].sort()

for (const [file, ships] of READMES) {
  test(`${file} documents exactly the commands it ships`, () => {
    const doc = documented(file)
    assert.deepStrictEqual(
      doc.filter((n) => !SHIPS_ANYWHERE.includes(n)),
      [],
      'documented but shipped nowhere — a command that was removed, or a typo',
    )
    assert.deepStrictEqual(
      ships().filter((n) => !doc.includes(n)),
      [],
      'shipped but undocumented — this is the half that let two live commands go unmentioned',
    )
  })
}

// The half above is only as good as its ability to fire. A name that ships
// nowhere must fail it, or the loosening just made it decorative.
test('a command that ships nowhere still fails the check', () => {
  const doc = [...documented('docs/linear.html'), 'spec-env-down']
  assert.deepStrictEqual(doc.filter((n) => !SHIPS_ANYWHERE.includes(n)), ['spec-env-down'])
})

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
  {
    phrase: 'cannot reach your conversation',
    why: 'that guard was REPLACED, not weakened by accident. A phase now waits on its page and `--claim-since` claims a pass that arrived inside the window — so what holds is the serve token plus that window, and a page saying otherwise documents a security model the engine no longer has',
  },
  {
    phrase: 'to record the verdict and commit nothing',
    why: '`review.commitWith: "none"` existed and was removed — it produced the one thing a review page must not have, a verdict that records itself and does nothing (`env/config.js`)',
  },
  {
    phrase: 'names that code back',
    why: 'the read-back round-trip is gone: one waiting pass is claimed the moment someone types `/spec-reviewed`, with nothing read out. The code tells two passes apart; it was never an authorisation',
  },
]

/**
 * WHAT THE NEGATIVE HALF READS, and the two things it deliberately does not.
 *
 * A `## v3` **section** recording what v3 removed is a record, not a claim —
 * reading it as current documentation would make an accurate changelog a test
 * failure, and the "fix" would be deleting the history.
 *
 * A paragraph marked `<!-- history -->` is the same exemption for a file with no
 * version-history section. `packages/common/README.md` needs it: replacing the
 * block that presented two removed skills as the live engine left one sentence
 * worth keeping — *the `/spec-env` and `/spec-env-down` skills were removed in
 * v3* — which is precisely the information a contributor reaching for them
 * wants. The marker has to be **deliberate**, so an unmarked mention still
 * fails; that is what stops it becoming a way to silence the check.
 */
function currentClaims(file) {
  const text = read(file)
  const m = text.match(REGION)
  const cut = text.search(/^## (v\d|Migrating)/m)
  const body = cut > 0 ? text.slice(0, cut) : text
  const withoutHistory = body
    .split(/\n\n+/)
    .filter((para) => !para.includes('<!-- history -->'))
    .join('\n\n')
  return withoutHistory + (m ? m[1] : '')
}

for (const [file] of READMES) {
  test(`${file} does not document behaviour that was removed`, () => {
    const current = currentClaims(file)
    for (const { phrase, why } of BANNED) {
      assert.ok(!current.includes(phrase), `${file} still says ${JSON.stringify(phrase)} — ${why}`)
    }
  })
}

// The marker must be DELIBERATE or it is a way to silence the check. An
// unmarked mention of the same phrase still fails, which is what makes the
// exemption an annotation rather than a loophole.
test('the history marker exempts only the paragraph carrying it', () => {
  const marked = 'The `/spec-env-down` skill was removed in v3. <!-- history -->'
  const unmarked = 'Tear the worktree down with `/spec-env-down`.'
  const strip = (text) =>
    text
      .split(/\n\n+/)
      .filter((para) => !para.includes('<!-- history -->'))
      .join('\n\n')
  assert.ok(!strip(marked).includes('/spec-env-down'), 'a marked note is exempt')
  assert.ok(strip(unmarked).includes('/spec-env-down'), 'an unmarked mention still fails')
  assert.ok(
    strip(`${marked}\n\n${unmarked}`).includes('/spec-env-down'),
    'and marking one paragraph does not exempt the next',
  )
})

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
