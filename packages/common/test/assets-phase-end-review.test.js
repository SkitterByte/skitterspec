'use strict'

/**
 * Every skill that takes work to green renders the page and offers the review.
 *
 * There are three of them — `/spec-next` builds phases, `/spec-bug` and
 * `/spec-hotfix` drive their own fix red→green — and for a while only the first
 * carried the step. The evidence was a spec built and completed with no page on
 * disk while its three siblings that day all had one. So this file asserts the
 * step across all three rather than per-skill, which is what makes losing it in
 * one of them a red test instead of a silent gap.
 *
 * The last test is the stays-silent half (`.claude/rules/negative-checks.md`
 * rule 3): the skills that LAND branches must not gain the step by someone
 * pasting it in for symmetry. That was decided deliberately — reviewing a whole
 * spec before landing is a different question from reviewing a phase.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

// The three that take work to green.
const RENDERS = ['spec-next', 'spec-bug', 'spec-hotfix']

for (const name of RENDERS) {
  const text = skillText(name)

  test(`/${name} renders the page`, () => {
    assert.match(text, /skitterspec spec-env review <spec>/)
    assert.match(text, /\*\*after\*\* the tests pass and\s*\n?\*\*before\*\* the commit/)
  })

  // The offer is the block's `Review` row now, not prose after it — see
  // `assets-offer-last.test.js` for why the anchor moved and what must not be
  // weakened when it moves again. All three skills carry the same wording, so
  // this asserts it across all three rather than in one.
  test(`/${name} offers the review as a question, in the Review row`, () => {
    assert.match(text, /want a written review before you commit\?/)
    assert.match(text, /The offer is the `Review` row/)
    assert.match(text, /It ends in a question, addressed to someone/)
    // The shape it must not go back to.
    assert.doesNotMatch(text, /```\nPage is rendered:/)
  })

  test(`/${name} never writes the review unasked and never publishes`, () => {
    assert.match(text, /\*\*Never write the review unasked\*\*, and \*\*never publish\*\*/)
    assert.match(text, /`\/spec-diff` §6 owns how/)
  })

  test(`/${name} treats a failed render as one line, never fatal`, () => {
    assert.match(text, /\*\*Never fatal\.\*\* A failed render/)
  })

  test(`/${name} is silent about the step when the project has no isolation`, () => {
    assert.match(text, /Only when the project has per-spec isolation/)
    assert.match(text, /rather\s+than explaining an absence/)
  })
}

// A hotfix's work starts at its base tag, so the branch view must not be
// described — or relayed — as measured from the base branch.
test('/spec-hotfix says the range is measured from the base tag', () => {
  const text = skillText('spec-hotfix')
  assert.match(text, /measured from the base tag, not from `main`/)
  assert.match(text, /says `since <tag>`/)
  assert.match(text, /do not relay it as `since main`/)
})

// --- stays silent -----------------------------------------------------------

test('the skills that land branches do not gain the step', () => {
  for (const name of ['spec-complete', 'spec-to-main']) {
    const text = skillText(name)
    assert.doesNotMatch(
      text,
      /spec-env review <spec>/,
      `${name} must not render a page — landing a branch is not ending a phase`,
    )
    assert.doesNotMatch(text, /Want a written review of it before you commit\?/, name)
  }
})

// --- the reader decides the wording, and only the engine decides the reader --

for (const name of RENDERS) {
  const text = skillText(name)

  test(`/${name} follows the engine's reader: line, with all three states`, () => {
    assert.match(text, /Follow the `reader:` line the engine printed/)
    assert.match(text, /absent\*\* \(`unknown`\)/)
    assert.match(text, /\*\*`local`\*\*/)
    assert.match(text, /\*\*`remote`\*\*/)
  })

  // The engine serves on a remote reader and puts an openable URL on `open:`,
  // so naming the serve command as the ANSWER is the old dead-link behaviour
  // coming back. Mentioning it as an opt-out consequence is still fine, which
  // is why this looks at the `remote` bullet rather than the whole file.
  test(`/${name} does not send a remote reader off to start the server`, () => {
    const bullet = text.match(/- \*\*`remote`\*\*[\s\S]*?(?=\n\n)/)
    assert.ok(bullet, 'the remote bullet is there to check')
    assert.doesNotMatch(bullet[0], /spec-env review serve --host/)
    assert.match(bullet[0], /relay\s+that line|as\s+printed/)
  })

  // Unknown is what a healthy local machine reports. Warning there would be an
  // accusation against the common case (`.claude/rules/negative-checks.md`).
  test(`/${name} does not warn on an unknown reader`, () => {
    assert.match(text, /Do not warn/)
    assert.match(text, /unknown is the ordinary state of a local machine/)
  })

  // The rule that replaced "wording, never action". Serving and publishing were
  // once one prohibition, and lumping them together is what left a remote reader
  // holding a dead link — a local server is ended by one flag, while a published
  // page is one this tooling cannot remove. The publishing half must stay
  // absolute; only the serving half moved.
  test(`/${name} authorises serving on a detection, and never publishing`, () => {
    assert.match(text, /never publish/i)
    assert.match(text, /cannot remove/)
    assert.doesNotMatch(
      text,
      /\*\*wording, never action\*\*/,
      'the old rule forbade serving too — it is what this spec overturned',
    )
  })
}

// THE regression guard for this phase. Detection lives in the engine precisely
// so it is testable, and the way that gets undone is a well-meaning edit
// teaching a skill to check the environment itself — which no test could then
// reach, and which would drift from the engine's ranking the first time either
// changed.
test('no skill sniffs the environment for the reader', () => {
  const ASSETS_SKILLS = path.join(__dirname, '..', 'assets', 'skills')
  for (const name of fs.readdirSync(ASSETS_SKILLS)) {
    const file = path.join(ASSETS_SKILLS, name, 'SKILL.md')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    // Naming them as forbidden is the point, so only USE is a failure: a line
    // that says "never read SSH_CONNECTION" must stay legal.
    for (const line of text.split('\n')) {
      if (/\b(SSH_CONNECTION|SSH_TTY|CLAUDE_CODE_[A-Z_]+)\b/.test(line)) {
        assert.match(
          line,
          /\b(not|never|Never)\b/,
          `${name}: mentions an env var outside a prohibition — ${line.trim()}`,
        )
      }
    }
  }
})

test('the config keys are documented where an adopter reads them', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core', 'env.config.md'), 'utf8')
  assert.match(doc, /"reader": "detect"/)
  assert.match(doc, /"servePort"/)
  assert.match(doc, /BELIEVED WITHOUT SNIFFING/)
  assert.match(doc, /unguessable path token/)
})

