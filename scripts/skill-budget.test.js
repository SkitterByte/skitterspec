'use strict'

/**
 * A skill's DESCRIPTION is loaded into every session; its BODY is loaded only
 * when the skill is invoked. That asymmetry is the whole economics of a skill
 * pack: description text is a per-session tax paid by every user whether or not
 * they ever run the skill, while body text is paid once, by the run that needs
 * it.
 *
 * Descriptions had drifted into carrying engine mechanics — which CLI a skill
 * shells out to, which transport it picks, which file it writes — none of which
 * helps the model decide whether this is the right skill. That belongs in the
 * body. What a description must carry is the trigger: the outcome, and the
 * phrasings a user actually types.
 *
 * So this file lints two things that pull in opposite directions, deliberately:
 * a ceiling on length, and a floor on routing signal. A budget alone would be
 * trivially satisfied by deleting the "Use when …" triggers, which is precisely
 * the edit that would break routing while making the number look better.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// The source-of-truth asset trees. The built dists under `packages/skitterspec*`
// are generated FROM these and are gitignored, so linting them would report the
// same failure twice and could never be fixed there.
const SKILL_TREES = ['packages/common/assets/skills', 'packages/linear/assets/skills']

// Chosen, not measured: long enough for an outcome plus the trigger phrases,
// short enough that 13 skills stay affordable in every session. Raising it is a
// real decision about per-session cost — make it deliberately, here.
const MAX_DESCRIPTION = 500

function skillDescriptions() {
  const out = []
  for (const rel of SKILL_TREES) {
    const dir = path.join(ROOT, rel)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const file = path.join(dir, entry.name, 'SKILL.md')
      if (!fs.existsSync(file)) continue
      const m = fs.readFileSync(file, 'utf8').match(/^description: (.*)$/m)
      out.push({ name: entry.name, rel: `${rel}/${entry.name}`, description: m && m[1] })
    }
  }
  return out
}

test('every skill ships a description', () => {
  const skills = skillDescriptions()
  assert.ok(skills.length >= 13, `expected the full skill set, found ${skills.length}`)
  const missing = skills.filter((s) => !s.description).map((s) => s.rel)
  assert.deepStrictEqual(missing, [], `SKILL.md without a description: ${missing.join(', ')}`)
})

test('no skill description exceeds the per-session budget', () => {
  const over = skillDescriptions()
    .filter((s) => s.description.length > MAX_DESCRIPTION)
    .map((s) => `${s.name}: ${s.description.length} > ${MAX_DESCRIPTION}`)
  assert.deepStrictEqual(over, [], `description over budget — move mechanism into the body:\n${over.join('\n')}`)
})

test('every skill description keeps its routing triggers', () => {
  // The floor. Without this, the budget above is satisfiable by deleting the
  // phrasings that make the skill findable — a smaller number, a worse pack.
  const untriggered = skillDescriptions()
    .filter((s) => !/use when/i.test(s.description))
    .map((s) => s.name)
  assert.deepStrictEqual(untriggered, [], `description has no "Use when …" trigger: ${untriggered.join(', ')}`)
})

test('no skill description can break its own frontmatter', () => {
  // Frontmatter is YAML and these are plain (unquoted) scalars, so a ": "
  // anywhere in the value makes the line parse as a nested mapping and the
  // skill fails to load — a description so broken it stops being read at all.
  const unsafe = skillDescriptions()
    .filter((s) => s.description.includes(': '))
    .map((s) => s.name)
  assert.deepStrictEqual(unsafe, [], `": " in a plain YAML scalar breaks the frontmatter: ${unsafe.join(', ')}`)
})
