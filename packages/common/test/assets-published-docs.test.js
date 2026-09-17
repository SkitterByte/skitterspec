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
//
// THE STEMS ARE NAMED, and the suffix is left open. Two shipped commands do not
// begin `spec` — `no-spec` and `allow-main` — so each adds its stem here, while
// `[a-z-]*` after it keeps the OTHER half of this test working: a removed
// command or a typo (`/spec-redy`, `/allow-mian`) still matches, and is still
// reported as documented-but-shipped-nowhere.
//
// Rejected: building the pattern from what actually ships. It is tempting and
// self-maintaining, and it would make that second half vacuous by construction —
// nothing could ever be documented-but-not-shipped if only shipped names can be
// found. Rejected too: `/[a-z-]+`, which matches every URL path segment and
// relative link in these files.
//
// Longest stem first, or `spec` would win the alternation before `no-spec` is
// tried.
const TOKEN = /(?<![\w./-])\/((?:no-spec|allow-main|spec)[a-z-]*)\b(?!\.md)/g

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

/**
 * EVERY SURFACE THAT CLAIMS COMPLETENESS, not one of them.
 *
 * This started as a check against the base README alone, and two keys added
 * after it was written — `allowNetwork` and `allowRemote` — walked straight
 * through `env.config.md`, the example config and the CLAUDE section. The base
 * README even sends people to `env.config.md` saying *every field* is
 * documented there, which made a missing key into a false sentence.
 *
 * A guard pointed at too few documents is the original failure one layer out, so
 * the fix is the same shape: read the claimants off a list, and put all of them
 * on it.
 */
const OWES_CONFIG_KEYS = [
  'packages/common/assets/core/env.config.md',
  'packages/common/assets/core/env.config.json.example',
  'packages/skitterspec/README.md',
]

// Read from `DEFAULT_CONFIG.review` rather than listed here, so a new key fails
// this until someone writes it up. That is the whole point: the keys added the
// week this was written are exactly the ones a hand-kept list would have missed.
for (const file of OWES_CONFIG_KEYS) {
  test(`${file} documents every review.* config key`, () => {
    const keys = Object.keys(DEFAULT_CONFIG.review)
    assert.ok(keys.length >= 5, 'sanity: the keys were read, not defaulted to empty')
    const text = read(file)
    // THREE SPELLINGS COUNT, because each surface has its own convention and
    // this check asserts the key is documented rather than dictating how. The
    // example is JSON (`"allowRemote"`), a README writes `review.allowRemote`,
    // and `env.config.md` documents keys as bare backticked names inside the
    // `"review": {` block it annotates.
    //
    // WHAT WOULD FOOL THIS: a bare backticked common word — `` `required` `` —
    // could appear incidentally and pass. Accepted rather than tightened: the
    // cost is a key recorded as "documented somewhere in the file", where the
    // alternative forces every surface to break its own style to satisfy a
    // test. The failure it exists for is a key nobody wrote up at all.
    const spellings = (k) => [`review.${k}`, `"${k}"`, '`' + k + '`']
    const missing = keys.filter((k) => !spellings(k).some((form) => text.includes(form)))
    assert.deepStrictEqual(missing, [], 'a review.* key nobody wrote up')
  })
}

/**
 * THE SECTION CLAUDE ITSELF READS, in every project that installs this.
 *
 * `init` patches `assets/claude-md-section.md` into a project's `CLAUDE.md`, so
 * a stale claim here is not a stale claim to a *reader* — it is one to the agent
 * doing the work. It is a live claim surface rather than a history, so the
 * negative half applies to it exactly as it does to a README.
 */
const CLAUDE_SECTION = 'packages/common/assets/claude-md-section.md'

test(`${CLAUDE_SECTION} does not document behaviour that was removed`, () => {
  const current = currentClaims(CLAUDE_SECTION)
  for (const { phrase, why } of BANNED) {
    assert.ok(!says(current, phrase), `${CLAUDE_SECTION} still says ${String(phrase)} — ${why}`)
  }
})

// It describes the loop, so it has to name the parts of the loop that exist. Not
// a set comparison — it is prose, not a reference — but these four were each
// added by a spec that shipped, and each is a thing an agent reading this file
// would otherwise not know it had.
test(`${CLAUDE_SECTION} names the controls the loop actually has`, () => {
  const text = read(CLAUDE_SECTION)
  for (const [what, why] of [
    ['/spec-remote-review', 'the command that turns the remote tier on'],
    ['commit-start', 'the authoring verdict — commit the spec and put it in flight'],
    ['local', 'the labelled tier stack: which surfaces the page can be read from'],
    ['live', 'whether the change is also running, and the press that changes it'],
  ]) {
    assert.ok(text.includes(what), `${CLAUDE_SECTION} does not mention ${what} — ${why}`)
  }
})

/**
 * AN UNRELEASED MIGRATION ENTRY IS A CLAIM. A released one is history.
 *
 * `MIGRATION.md` is mostly history by design — describing how things used to
 * work is its whole job — so checking it wholesale would accuse an accurate
 * changelog. But an entry for a version that has **not shipped** is a promise
 * about what you are about to release, and it has to be true today.
 *
 * The signal is POSITIVE and cheap: the version in that package's
 * `package.json`. An entry whose target is above it has not shipped. Without
 * that signal the check would either accuse history or miss exactly the bug it
 * exists for — the v22 entry said the review server's bind is chosen by
 * `review.reader`, which stopped being true when it moved to
 * `review.allowNetwork`, in a release that had not gone out yet.
 */
function unreleasedMigrationEntries() {
  const text = read('MIGRATION.md')
  const shipped = {
    '@skitterbyte/skitterspec': require(path.join(ROOT, 'packages/skitterspec/package.json')).version,
    '@skitterbyte/skitterspec-linear': require(
      path.join(ROOT, 'packages/skitterspec-linear/package.json'),
    ).version,
  }
  const heads = [...text.matchAll(/^## `(@[^`]+)` v(\d+) → v(\d+).*$/gm)]
  const out = []
  heads.forEach((h, i) => {
    const major = Number(String(shipped[h[1]] || '0').split('.')[0])
    if (Number(h[3]) <= major) return
    const start = h.index
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length
    out.push({ head: h[0], body: text.slice(start, end) })
  })
  return out
}

test('an unreleased migration entry is currently true', () => {
  const entries = unreleasedMigrationEntries()
  // NO UNRELEASED ENTRY IS A HEALTHY STATE, not a missing fixture. It means
  // every package has shipped up to everything the guide documents — which is
  // exactly where a repo sits the moment a release finishes, and where this one
  // sat when skitterspec@22 and skitterspec-linear@17 both went out. This used
  // to `assert.ok(entries.length)` and failed the suite there, taking the
  // release with it; the check has nothing to say, so it says nothing
  // (`.claude/rules/negative-checks.md` rule 4).
  for (const { head, body } of entries) {
    for (const { phrase, why, exceptMigration } of BANNED) {
      if (exceptMigration) continue
      assert.ok(!says(body, phrase), `${head} still says ${String(phrase)} — ${why}`)
    }
  }
})

/**
 * REJECTED: requiring an unreleased entry to name every `review.*` key.
 *
 * It was written, and it accused the v22 entry for not re-documenting
 * `commitWith` and `required` — keys that shipped in v20 and v21. A migration
 * entry documents a **transition**, and this check cannot tell which keys are
 * new in one, so demanding all of them makes an accurate entry fail. That is
 * the exact over-reach this whole spec exists to avoid, so it went.
 *
 * `env.config.md` is what guarantees every key is documented *somewhere*
 * authoritative; the migration guide's job is what changed.
 *
 * AND BE STRAIGHT ABOUT WHAT FOUND THE BUG: no check here would have caught
 * *"What the server binds to is still chosen by `review.reader`"*. It is not a
 * removed name or a removed phrase — it is a true sentence that a later release
 * made false. A person asking "are we sure the docs are up to date?" found it.
 * It is banned by name below so it cannot come back, which is all an explicit
 * list can ever do: it closes the door behind a mistake rather than predicting
 * the next one.
 */
test('STAYS SILENT: an unreleased entry need not re-document older keys', () => {
  const entries = unreleasedMigrationEntries()
  // Same as above: with everything released there is no entry to demonstrate
  // this on, and that is not a failure. Destructuring the empty set is what
  // threw `Cannot read properties of undefined` during a release.
  if (!entries.length) return
  const { body } = entries[0]
  // Shipped in v20/v21 and correctly absent from the v22 entry's own subject.
  assert.ok(!body.includes('commitWith'), 'sanity: it really does not mention them')
  assert.ok(!body.includes('`required`'), 'sanity: nor this one')
  // And the check above passed anyway, which is the assertion that matters.
})

// STAYS SILENT: a RELEASED entry may say anything about how things used to work.
// That is what a migration guide is, and a check that could not tell the two
// apart would turn an accurate record into a build failure.
test('STAYS SILENT: released migration entries are history and go unchecked', () => {
  const text = read('MIGRATION.md')
  const unreleased = unreleasedMigrationEntries().map((e) => e.head)
  const all = [...text.matchAll(/^## `(@[^`]+)` v(\d+) → v(\d+).*$/gm)].map((m) => m[0])
  const released = all.filter((h) => !unreleased.includes(h))
  assert.ok(released.length > 3, 'sanity: most entries are history')
  // And at least one of them says something the negative half bans — which is
  // correct of it, and the assertion that this test is worth having.
  const body = text.slice(text.indexOf(released[0]))
  assert.ok(
    BANNED.some(({ phrase }) => says(body, phrase)),
    'a released entry names something since removed — and must not fail for it',
  )
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
    // A RENAME MIGRATION HAS TO NAME THE OLD KEY — that is the entry's whole
    // job, and banning it there would force the guide to describe a rename
    // without saying what was renamed. Scoped rather than dropped: it stays
    // banned in every document that describes the product as it is now.
    exceptMigration: true,
  },
  {
    phrase: '/spec-env-down',
    why: 'the skill was removed in v3 — teardown folded into `/spec-complete` and `/spec-cancel`. Naming it in version history is fine; naming it as a command is not',
  },
  {
    // A REGEX, because the same wrong claim was written two ways. The site said
    // *"cannot reach your conversation"* and the CLAUDE section said *"cannot
    // reach this conversation"* — one substring caught one of them and walked
    // past the other, in the file Claude itself reads. An explicit list is the
    // only shape that can cover prose, and this is the care it needs: ban the
    // claim, not one phrasing of it.
    phrase: /cannot reach (your|this) conversation/,
    why: 'that guard was REPLACED, not weakened by accident. A phase now waits on its page and `--claim-since` claims a pass that arrived inside the window — so what holds is the serve token plus that window, and a page saying otherwise documents a security model the engine no longer has',
  },
  {
    phrase: 'to record the verdict and commit nothing',
    why: '`review.commitWith: "none"` existed and was removed — it produced the one thing a review page must not have, a verdict that records itself and does nothing (`env/config.js`)',
  },
  {
    phrase: /binds to is still\s+chosen by `review\.reader`/,
    why: '`review.allowNetwork` chooses the bind now; `review.reader` decides only how a page\'s location is worded. This one was TRUE when it was written and made false by a later release — no check here would have predicted it, a person asking found it, and it is listed so it cannot come back',
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
// A banned entry is a string or a RegExp; `says` is the one place that knows.
const says = (text, phrase) =>
  phrase instanceof RegExp ? phrase.test(text) : text.includes(phrase)

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
      assert.ok(!says(current, phrase), `${file} still says ${String(phrase)} — ${why}`)
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
