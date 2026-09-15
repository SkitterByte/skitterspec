'use strict'

/**
 * Every lifecycle skill ends with the block defined in
 * `assets/rules/spec-reports.md`. The rule is prose and prose decays, so this
 * is the enforcement: each skill must POINT at the contract, and must declare
 * which verdicts and fields it emits.
 *
 * The vocabulary is read OUT OF THE RULE rather than restated here. A second
 * copy of the field list would be a second thing to keep in step with the
 * first, and the whole reason the rule exists is that thirteen skills had each
 * invented their own ending.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
const RULE = path.join(ROOT, 'packages', 'common', 'assets', 'rules', 'spec-reports.md')

// The skills that end with the block, per package. Phase 3 extends this list
// with the provider's; nothing else about the test changes.
const SKILLS = {
  common: [
    'spec',
    'spec-bug',
    'spec-hotfix',
    'spec-start',
    'spec-next',
    'spec-to-main',
    'spec-complete',
    'spec-cancel',
    'spec-review',
    'spec-diff',
    'spec-reviewed',
    'spec-init',
  ],
  // Phase 3. A provider's skills end the same way as the base's — one shape
  // everywhere beats a rule about which kind of skill gets which ending.
  linear: ['spec-push', 'spec-status', 'spec-list', 'spec-claim', 'spec-sync', 'spec-linear-setup'],
}

// Every skill that ships, from either package. Compared against SKILLS below so
// a skill added tomorrow cannot quietly ship without an ending — the list above
// is what this test drives from, and a list is exactly the thing that goes
// stale silently.
function shippedSkills() {
  const out = []
  for (const pkg of ['common', 'linear']) {
    const dir = path.join(ROOT, 'packages', pkg, 'assets', 'skills')
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))) out.push(`${pkg}:${e.name}`)
    }
  }
  return out.sort()
}

const skillText = (pkg, name) =>
  fs.readFileSync(path.join(ROOT, 'packages', pkg, 'assets', 'skills', name, 'SKILL.md'), 'utf8')

const entries = () =>
  Object.entries(SKILLS).flatMap(([pkg, names]) => names.map((n) => [`${pkg}:${n}`, pkg, n]))

// Read the vocabulary and the verdict set from the rule's own tables, so the
// two can never disagree: a field renamed there renames it here.
function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}`)
  assert.notStrictEqual(start, -1, `the rule has a "${heading}" section`)
  const rest = text.slice(start + 1)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

function ruleTokens(heading) {
  const rule = fs.readFileSync(RULE, 'utf8')
  const rows = [...section(rule, heading).matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1])
  assert.ok(rows.length > 2, `read the ${heading} table, got ${rows.length} rows`)
  return rows
}

const VOCABULARY = ruleTokens('Field vocabulary, in this order')
const VERDICTS = ruleTokens('The four verdicts')

// What a skill declares: a `**Fields:**` run up to the next blank line (it may
// wrap), and `**Verdicts**` bullets.
function declaredFields(text) {
  const at = text.indexOf('**Fields:**')
  if (at === -1) return null
  const end = text.indexOf('\n\n', at)
  const run = text.slice(at, end === -1 ? undefined : end)
  return [...run.matchAll(/`([^`]+)`/g)].map((m) => m[1])
}

function declaredVerdicts(text) {
  const at = text.indexOf('**Verdicts**')
  if (at === -1) return []
  const end = text.indexOf('\n**Fields:**', at)
  const run = text.slice(at, end === -1 ? undefined : end)
  return [...run.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1])
}

// The list above is hand-maintained, and a hand-maintained list of what ships is
// the failure mode `assets-prose.test.js` was written about. It cannot be
// replaced by discovery here — a skill's ABSENCE from the contract is the thing
// being tested — so instead the two are compared, and a mismatch names the skill.
test('every shipped skill is in the contract list', () => {
  const listed = entries().map(([label]) => label).sort()
  assert.deepStrictEqual(
    shippedSkills(),
    listed,
    'a skill ships without a report ending, or the list names one that does not ship',
  )
})

test('the rule is readable, or every guard below is vacuous', () => {
  assert.ok(VOCABULARY.includes('Follow-ups'), `vocabulary: ${VOCABULARY}`)
  assert.ok(VOCABULARY.includes('Why'), `vocabulary: ${VOCABULARY}`)
  assert.strictEqual(VERDICTS.length, 4, `verdicts: ${VERDICTS}`)
  assert.strictEqual(entries().length, 18, 'all 18 skills are covered')
})

// --- the banner ------------------------------------------------------------
//
// The contract shipped and the very next run ignored all of it. Nothing was
// stale: the skills carried the pointer and the rule was current. The pointer
// was simply in the LAST section, phrased as "End with the block defined in …",
// so a model reading top-to-bottom narrated its way through every step the
// silence rule would have prevented and met the rule only after the damage.
//
// So these assert POSITION, not presence. A banner that drifts below the first
// working section is the bug returning with a passing test beside it.

// The blockquote under each h1. Read from a skill rather than written here: a
// literal in the test is a second source of truth, and the first wording change
// would leave the two disagreeing with no way to tell which is right.
function bannerOf(text) {
  const h1 = text.search(/^# /m)
  if (h1 === -1) return null
  const after = text.slice(text.indexOf('\n', h1) + 1)
  const m = after.match(/^\s*((?:^>.*\n?)+)/m)
  return m ? m[1].trim() : null
}

const REFERENCE = bannerOf(skillText('common', 'spec-next'))

test('the reference banner is readable, or the guards below are vacuous', () => {
  assert.ok(REFERENCE, 'found a banner to compare the others against')
  assert.match(REFERENCE, /Stay silent while this runs/)
  assert.match(REFERENCE, /`\.claude\/rules\/spec-reports\.md`/)
})

test('every skill carries the banner, before its first section', () => {
  for (const [label, pkg, name] of entries()) {
    const text = skillText(pkg, name)
    const banner = bannerOf(text)
    assert.ok(banner, `${label} has a banner under its h1`)
    // POSITION is the point: it must precede the first `## ` heading, because a
    // banner read after the first working step is read too late to act on.
    const firstSection = text.search(/^## /m)
    assert.ok(firstSection > -1, `${label} has at least one section`)
    assert.ok(
      text.indexOf(banner) < firstSection,
      `${label} states the banner after its first section — too late to act on`,
    )
  }
})

test('the banner is identical across every skill', () => {
  for (const [label, pkg, name] of entries()) {
    assert.strictEqual(
      bannerOf(skillText(pkg, name)),
      REFERENCE,
      `${label}'s banner has drifted from the others`,
    )
  }
})

// --- stays silent -----------------------------------------------------------
//
// `.claude/rules/negative-checks.md` rule 3. A position check written too
// tightly turns ordinary formatting into a failure, so these feed it healthy
// shapes and assert it says nothing: frontmatter above the h1 (every skill has
// it), and prose between the banner and the first section (most skills have
// that too, and it is not a fault).
test('ordinary formatting around the banner is not flagged', () => {
  const shaped = [
    '---',
    'name: example',
    '---',
    '',
    '# /example — a skill',
    '',
    '> Stay silent while this runs.',
    '> Read `.claude/rules/spec-reports.md` before reporting.',
    '',
    'Some prose introducing the skill, which many of them have.',
    '',
    '## 1. First step',
  ].join('\n')

  const banner = bannerOf(shaped)
  assert.match(banner, /Stay silent/)
  assert.ok(shaped.indexOf(banner) < shaped.search(/^## /m), 'prose after it is fine')
})

test('a banner pushed below the first section is caught', () => {
  const bad = ['# /example — a skill', '', '## 1. First step', '', '> Stay silent while this runs.'].join('\n')
  const banner = bannerOf(bad)
  assert.ok(banner, 'the banner is still found')
  assert.ok(bad.indexOf(banner) > bad.search(/^## /m), 'and its position is what fails')
})

test('every lifecycle skill points at the contract rule', () => {
  for (const [label, pkg, name] of entries()) {
    assert.match(
      skillText(pkg, name),
      /`\.claude\/rules\/spec-reports\.md`/,
      `${label} names the contract rule`,
    )
  }
})

test('every lifecycle skill declares its fields, in the rule’s order', () => {
  for (const [label, pkg, name] of entries()) {
    const fields = declaredFields(skillText(pkg, name))
    assert.ok(fields, `${label} has a **Fields:** declaration`)
    for (const f of fields) {
      assert.ok(VOCABULARY.includes(f), `${label} declares \`${f}\`, which is not in the vocabulary`)
    }
    const order = fields.map((f) => VOCABULARY.indexOf(f))
    assert.deepStrictEqual(
      order,
      [...order].sort((a, b) => a - b),
      `${label} declares its fields out of the rule's order: ${fields.join(' ')}`,
    )
    assert.strictEqual(new Set(fields).size, fields.length, `${label} declares a field twice`)
  }
})

// The point of the field: a recorded `none` is a decision, a missing line is an
// oversight. A skill that may omit it has opted out of the only part of the
// block that is not conditional.
test('every lifecycle skill declares Follow-ups, and ends on Next', () => {
  for (const [label, pkg, name] of entries()) {
    const fields = declaredFields(skillText(pkg, name))
    assert.ok(fields.includes('Follow-ups'), `${label} declares Follow-ups`)
    // `Next` is last where it is declared. A skill with nothing to hand on to
    // legitimately has no `Next`, and then `Follow-ups` is the final row — so
    // this asserts the position of `Next`, not that every skill must have one.
    if (fields.includes('Next')) {
      assert.strictEqual(fields[fields.length - 1], 'Next', `${label} ends its fields on Next`)
    } else {
      assert.strictEqual(fields[fields.length - 1], 'Follow-ups', `${label} ends on Follow-ups`)
    }
  }
})

// The closing row is the one the reader acts on, so a skill that hands on to
// something must say so in the row the eye stops at.
test('a skill with no Next legitimately ends on Follow-ups', () => {
  const fields = declaredFields('**Fields:** `Built` · `Follow-ups`')
  assert.strictEqual(fields[fields.length - 1], 'Follow-ups')
  assert.ok(!fields.includes('Next'))
})

test('every declared verdict is one of the four', () => {
  for (const [label, pkg, name] of entries()) {
    const verdicts = declaredVerdicts(skillText(pkg, name))
    assert.ok(verdicts.length > 0, `${label} declares which verdicts can occur`)
    for (const v of verdicts) {
      assert.ok(VERDICTS.includes(v), `${label} declares ${v}, which is not one of ${VERDICTS}`)
    }
    assert.strictEqual(new Set(verdicts).size, verdicts.length, `${label} declares a verdict twice`)
  }
})

// `Why` is the non-✅ field. A skill may not declare it as one of its ordinary
// fields — the rule already puts it there whenever the verdict is not ✅, and
// declaring it reads as "this skill always explains itself", which is the
// opposite of what it means.
test('no skill declares Why as one of its fields', () => {
  for (const [label, pkg, name] of entries()) {
    assert.ok(
      !declaredFields(skillText(pkg, name)).includes('Why'),
      `${label} declares \`Why\`; it belongs to the verdict, not the field list`,
    )
  }
})

// --- stays silent -----------------------------------------------------------
//
// `.claude/rules/negative-checks.md` rule 3. The tests above prove the guard can
// fire; this one proves it does not fire at a skill whose report is correctly
// MINIMAL. Without it, the pressure is always toward declaring more fields to
// keep a checker quiet — which is how a contract meant to shrink these sections
// would end up growing them.
test('a minimal but correct report section is not flagged', () => {
  const minimal = [
    'Ends with the block in `.claude/rules/spec-reports.md`.',
    '',
    '**Verdicts**',
    '',
    '- `✅` — it worked.',
    '',
    '**Fields:** `Follow-ups`',
    '',
    'Some prose after it.',
  ].join('\n')

  const fields = declaredFields(minimal)
  assert.deepStrictEqual(fields, ['Follow-ups'], 'the smallest legitimate field list is readable')
  assert.ok(fields.every((f) => VOCABULARY.includes(f)))
  assert.deepStrictEqual(declaredVerdicts(minimal), ['✅'], 'one verdict is enough')
  assert.match(minimal, /`\.claude\/rules\/spec-reports\.md`/)
})

// A skill that reports `Follow-ups` and nothing else is declaring the one
// unconditional field. That is legitimate — there is no lower bar to fall
// through — so the "at least one field" check must be satisfied by it rather
// than demanding a second.
test('Follow-ups alone satisfies the field requirement', () => {
  assert.ok(declaredFields('**Fields:** `Follow-ups`').length > 0)
})

// ---------------------------------------------------------------------------
// A skill that deliberately leaves the tree DIRTY must not hand the reader a
// `Next` that the dirty tree refuses.
//
// The two halves live two sections apart in the same file, which is why this
// went unnoticed: `/spec-next` §6 says "Do **not** `git commit` unless the user
// asks — finish, verify, and wait", and its Report section then documents the
// last row as `/spec-next → phase 3 (Auth)`. Type that and §2 of the same skill
// refuses, because the phase you just built is still uncommitted. The reader is
// sent to a refusal by the contract's own worked example.

const LEAVES_DIRTY = /Do \*\*not\*\* `git commit` unless the user asks/

// The skills whose `Next` is PRESCRIBED rather than left to the run. A skill
// that only lists `Next` among its fields is not making a claim about what goes
// in it, so there is nothing here to be wrong.
const PRESCRIBES_NEXT = [
  ['common', 'spec-next'],
  ['common', 'spec-bug'],
]

// The sentence each skill's Report section uses to prescribe the row.
//
// Anchored to a LINE START, because `Next` also appears mid-line in every
// skill's `**Fields:**` list — and that list makes no claim about what the row
// says, so matching it would test the wrong sentence and stay red after the
// prescription was fixed.
function nextGuidance(text) {
  // Find the line-anchored mention, then slice to the blank line with indexOf.
  // NOT a lazy regex ending in `$` under the `m` flag — `$` is then end of LINE,
  // so it stops at the first newline and reads one line of a paragraph that is
  // usually several. That bug made this check pass over a fixed prescription.
  const at = /^`Next`/m.exec(text)
  if (!at) return ''
  const rest = text.slice(at.index)
  const end = rest.indexOf('\n\n')
  return end === -1 ? rest : rest.slice(0, end)
}

test('a skill that leaves the tree dirty tells you to commit before the next step', () => {
  const offenders = []
  for (const [pkg, name] of PRESCRIBES_NEXT) {
    const text = skillText(pkg, name)
    // Only skills that actually leave work uncommitted are held to this.
    if (!LEAVES_DIRTY.test(text)) continue
    const guidance = nextGuidance(text)
    if (!/\/commit/.test(guidance)) offenders.push(`${pkg}:${name} — ${guidance.split('\n')[0]}`)
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `a skill leaves the tree dirty and its Next omits the commit:\n${offenders.join('\n')}`,
  )
})

test('the rule itself says a dirty tree changes what Next may say', () => {
  // The skills are instances; this is the cause. `Next` was defined as "the
  // single next action for this work" with nothing tying it to the state the
  // skill just left the tree in, so two skills independently wrote a Next that
  // could not be run. Fixing only the instances leaves the next one free to
  // repeat it.
  const rule = fs.readFileSync(RULE, 'utf8')
  assert.match(rule, /runnable from the state the run actually leaves behind/i)
})

// STAYS SILENT (`negative-checks.md` rule 3). A skill that commits its own work
// is not making this mistake, and must not be dragged into the check by having
// the word `Next` in it.
test('stays silent: a skill that commits its own work needs no commit in Next', () => {
  const clean = '`Next` is `/spec-start <name>`, with the name spelled the way it must be typed.'
  assert.ok(!LEAVES_DIRTY.test(clean), 'this skill leaves nothing uncommitted')
  // `/spec-complete` and `/spec-start` both commit what they write, and neither
  // should ever be required to say `/commit` first.
  for (const name of ['spec-complete', 'spec-start']) {
    assert.ok(!LEAVES_DIRTY.test(skillText('common', name)), `${name} commits its own work`)
  }
})

// --- asking implies waiting -------------------------------------------------

/**
 * A `Review` row cannot be waited on, so a question inside one is unanswerable
 * by construction. That is not a style point: `/spec-bug` and `/spec-hotfix`
 * shipped a row asking *"want a written review before you commit?"* and then
 * finished with nothing watching, and two verdicts pressed on one spec's page
 * sat in the holding area unread. The second was pressed only because the first
 * appeared to do nothing.
 *
 * WHAT WOULD FOOL THIS: it reads the ROW, not the skill. A skill may still ask
 * whatever it likes in the banner — which is the shape that waits — and this
 * check must never see that, or the fix for the failure becomes indistinguishable
 * from the failure.
 */
const REVIEW_ROW = /^\|\s*\*\*Review\*\*\s*\|(.*)\|\s*$/gm

test('no skill asks a question in a Review row', () => {
  const offenders = []
  for (const [id, pkg, name] of entries()) {
    for (const m of skillText(pkg, name).matchAll(REVIEW_ROW)) {
      if (m[1].includes('?')) offenders.push(`${id}: ${m[1].trim()}`)
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    'a Review row carries counts and the link — a question belongs in the banner, ' +
      'which is the shape that waits for the answer',
  )
})

test('the rule says why the row carries no question', () => {
  const rule = fs.readFileSync(RULE, 'utf8')
  assert.match(rule, /\*\*ASKING IMPLIES WAITING/)
  assert.match(rule, /loses the question/)
  assert.match(rule, /a reader taught that the button is decorative/)
  // The rejected alternative, kept where the next editor will meet it.
  assert.match(rule, /a truthful caveat does not make an unanswerable question worth\s*\n?asking/i)
})

// The detector has to be able to fire, or the test above passes for the wrong
// reason once someone reformats a row.
test('the guard fires on the shape this phase removed', () => {
  const bad = '| **Review** | 7 files, +212 −18 · [open the page](file:///…) — want a written review? |\n'
  const found = [...bad.matchAll(REVIEW_ROW)].filter((m) => m[1].includes('?'))
  assert.strictEqual(found.length, 1, 'the old row is caught')
})

// STAYS SILENT (`negative-checks.md` rule 3). The rule is about the ROW. A
// question in the banner is the correct shape, and a skill that waits must not
// be accused for asking there.
test('stays silent: a question in the banner, and a row without one, both pass', () => {
  const banner =
    "**[Open the page](http://…)** · I'm holding here until you send a verdict.\n" +
    'Want a written review before you commit?\n' +
    '| **Review** | 7 files, +212 −18 · [open the page](file:///…) |\n'
  const found = [...banner.matchAll(REVIEW_ROW)].filter((m) => m[1].includes('?'))
  assert.deepStrictEqual(found, [], 'only the row is read, and this row asks nothing')
})
