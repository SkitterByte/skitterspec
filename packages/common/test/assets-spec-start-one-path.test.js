'use strict'

/**
 * `/spec-start`'s worktree mode has ONE path: provision, trust, bootstrap,
 * housekeep, print the path. Every assertion here is an inversion of one that
 * used to say the opposite — the skill once moved the session into the worktree
 * with `EnterWorktree`, and carried two fallback branches and a config-driven
 * opener for the cases where it could not.
 *
 * That machinery existed to put a shell or a window somewhere particular, which
 * is a thing you needed only because you could not otherwise see what a phase
 * changed. `/spec-diff` answers that from wherever you are, so the machinery had
 * nothing left to do. Three specs were cancelled reaching for it (SKS-82,
 * SKS-121, SKS-134); these tests exist so it does not come back a fourth time.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'assets', ...p), 'utf8')

const SKILL = read('skills', 'spec-start', 'SKILL.md')
const PLANNING = read('rules', 'spec-planning.md')
const ENV_DOC = read('core', 'env.config.md')
const README = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')

// Every shipped surface that described the old flow. Checked as a set, because
// the last removal was found by a completion sweep rather than by a test: the
// spec's Impact table named the skills and the config doc but not the README.
const SURFACES = [
  ['spec-start/SKILL.md', SKILL],
  ['rules/spec-planning.md', PLANNING],
  ['core/env.config.md', ENV_DOC],
  ['README.md', README],
  ['skills/spec-bug/SKILL.md', read('skills', 'spec-bug', 'SKILL.md')],
  ['skills/spec-hotfix/SKILL.md', read('skills', 'spec-hotfix', 'SKILL.md')],
]

test('no shipped surface mentions EnterWorktree', () => {
  for (const [name, text] of SURFACES) {
    assert.doesNotMatch(text, /EnterWorktree/, `${name} still names EnterWorktree`)
  }
})

test('no shipped surface mentions the opener', () => {
  for (const [name, text] of SURFACES) {
    assert.doesNotMatch(text, /open\.command|openCommand/, `${name} still names open.command`)
    assert.doesNotMatch(text, /\bopener\b/i, `${name} still describes an opener`)
  }
})

test('the engine has no opener left to configure', () => {
  // The positive half of the two above: prose can only stop describing a key
  // that has actually gone, and a key left behind is a key someone re-documents.
  const src = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8')
  for (const f of [['env', 'config.js'], ['env', 'render.js'], ['env', 'provision.js'], ['cli.js']]) {
    assert.doesNotMatch(src(...f), /openCommand|expandOpenCommand|\.open\b/, `src/${f.join('/')}`)
  }
  const { loadEnvConfig } = require('../src/env/config.js')
  const { config } = loadEnvConfig(path.join(__dirname, 'fixtures-nonexistent'))
  assert.strictEqual(config.open, undefined, 'the default config has no open block')
})

test('the shipped config example carries no key the merge would ignore', () => {
  // How the opener nearly survived its own removal: `open` was gone from the
  // defaults, the merge and every doc, but the JSON EXAMPLE still shipped it —
  // and that file is what a new adopter copies. The merge copies known keys
  // only, so a stale block is silently ignored rather than rejected, which is
  // exactly why nothing else would have caught it.
  const { DEFAULT_CONFIG } = require('../src/env/config.js')
  const example = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'assets', 'core', 'env.config.json.example'), 'utf8'),
  )
  const unknown = Object.keys(example).filter((k) => !(k in DEFAULT_CONFIG))
  assert.deepStrictEqual(unknown, [], `example ships key(s) the engine ignores: ${unknown.join(', ')}`)

  // And prove it can fire: the check is only worth having if a stale key trips it.
  const stale = { ...example, open: { command: '' } }
  assert.deepStrictEqual(Object.keys(stale).filter((k) => !(k in DEFAULT_CONFIG)), ['open'])
})

test('worktree mode declares exactly one path', () => {
  assert.match(SKILL, /\*\*One path\./)
  assert.match(SKILL, /none should be added back/)
})

test('the skill never tells the operator the session moved', () => {
  assert.match(SKILL, /The session does not move/)
  assert.doesNotMatch(SKILL, /this session, no new window/)
  assert.doesNotMatch(SKILL, /hand off as before/)
})

test('the hand-off mechanics survived — they are now the only mechanics', () => {
  // These were the FALLBACK branch. Deleting the branch must not delete the way
  // the worktree is actually reached, or a start ends with nothing bootstrapped.
  for (const kept of [/cd "<worktreePath>"/, /git -C <worktreePath>/, /\/add-dir/]) {
    assert.match(SKILL, kept)
  }
  assert.match(SKILL, /from a session in\s*\n?it/, 'it still says where to run /spec-next')
})

test('the trust step is kept, and says why it is not tab machinery', () => {
  assert.match(SKILL, /Trust the worktree/)
  assert.match(SKILL, /worktrees live outside\s*\n?\s*the checkout/)
})

test('the skill points at /spec-diff as what replaced needing a shell there', () => {
  // Without this sentence the simplification reads as a removal with nothing put
  // in its place, which is how it gets argued back in.
  assert.match(SKILL, /`\/spec-diff`/)
})

test('/spec-next resolution is still declared unchanged', () => {
  // Loosening rule 2 is the tempting "fix" when a start lands somewhere else.
  // It was the wrong lever when the session moved and it still is.
  assert.match(SKILL, /`\/spec-next` is unchanged by this/)
  assert.match(SKILL, /nothing about its\s*\n?resolution is loosened/i)
})

test('the rules file describes building a branch, not moving a session', () => {
  assert.doesNotMatch(PLANNING, /moves\s*\n?the session you typed into/)
  assert.match(PLANNING, /tells you the path/)
})

test('the README describes the same one path', () => {
  assert.doesNotMatch(README, /moves the session you\s*\n?\s*typed into/)
  assert.match(README, /prints the path/)
  assert.match(README, /\/spec-diff/)
})

test('stays silent: the words that merely CONTAIN the removed ones still pass', () => {
  // `open` is an ordinary English word and appears all over these files ("open
  // questions", "open a session", "opens"). A guard matching it loosely would
  // fire on every one of them, which is how a guard gets deleted rather than
  // fixed. Prove the patterns above are narrow enough to live with.
  const innocent = [
    'Open questions',
    'open a session rooted at the printed path',
    'the file opens in your editor',
    'reopening the spec',
  ].join('\n')
  assert.doesNotMatch(innocent, /open\.command|openCommand/)
  assert.doesNotMatch(innocent, /\bopener\b/i)
  assert.doesNotMatch(innocent, /EnterWorktree/)
})
