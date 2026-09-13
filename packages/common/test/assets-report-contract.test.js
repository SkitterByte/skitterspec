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
    'spec-init',
  ],
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

test('the rule is readable, or every guard below is vacuous', () => {
  assert.ok(VOCABULARY.includes('Follow-ups'), `vocabulary: ${VOCABULARY}`)
  assert.ok(VOCABULARY.includes('Why'), `vocabulary: ${VOCABULARY}`)
  assert.strictEqual(VERDICTS.length, 4, `verdicts: ${VERDICTS}`)
  assert.ok(entries().length > 10, 'the skill list is populated')
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
test('every lifecycle skill declares Follow-ups, and declares it last', () => {
  for (const [label, pkg, name] of entries()) {
    const fields = declaredFields(skillText(pkg, name))
    assert.strictEqual(fields[fields.length - 1], 'Follow-ups', `${label} ends its fields on Follow-ups`)
  }
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
