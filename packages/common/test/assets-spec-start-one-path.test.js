'use strict'

/**
 * `/spec-start`'s worktree mode has ONE path: provision, trust, bootstrap,
 * housekeep, print the path. Every assertion here is an inversion of one that
 * used to say the opposite — the skill once moved the session into the worktree
 * with `EnterWorktree`, and carried two fallback branches and a config-driven
 * opener for the cases where it could not.
 *
 * The session moves again — a bare `/spec-start` has to leave a bare `/spec-next`
 * able to answer, and only a session inside the worktree does that. What stays
 * gone is the MECHANISM: the move is a plain `cd` in the bootstrap command, never
 * a tool call and never a spawned terminal. Three specs were cancelled reaching
 * for that machinery (SKS-82, SKS-121, SKS-134); these tests exist so it does not
 * come back a fourth time, now that there is a moving session to hang it off.
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
  // The teardown pair joined the set when the session started moving again:
  // they are the only surfaces that tell you how to get back OUT, so they are
  // where a tool call would be reintroduced.
  ['skills/spec-complete/SKILL.md', read('skills', 'spec-complete', 'SKILL.md')],
  ['skills/spec-cancel/SKILL.md', read('skills', 'spec-cancel', 'SKILL.md')],
]

// MIGRATION.md is deliberately NOT in that set, and this is the note that stops
// someone adding it. It has to NAME `open.command` — the whole point of the
// entry is telling upgraders to delete that key — so the opener guard would fire
// on the one surface where the words are correct. Its own guard is in
// `assets-kickoff-surfaces.test.js`, narrowed to the tool rather than the key.

// This guard OUTLIVED the reason it was written. It once proved the dead tab
// machinery was gone; now that `/spec-start` moves the session again, it is what
// pins HOW. `EnterWorktree` asks for approval, and that prompt is unusable on a
// phone — it leaves the session stuck with no way to answer. A plain `cd` needs
// no approval and does the same job, so the tool must stay absent even though
// the behaviour it used to implement is back.
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
  // NESTED, not just top-level. `open` was a whole block, but a stale key inside
  // a live block — `review.publish`, say — is the same trap one level down and
  // the top-level check cannot see it: `review` is known, so the block passes
  // while the key inside it is dropped by the same silent merge.
  const unknown = []
  for (const [k, v] of Object.entries(example)) {
    if (!(k in DEFAULT_CONFIG)) { unknown.push(k); continue }
    const defaults = DEFAULT_CONFIG[k]
    // Only where the default is an object to compare against. An array default
    // (`dev`, `setup`) has no key set, and a scalar has none either — there is
    // nothing to be unknown about, so there is nothing to accuse.
    if (!isPlainObject(v) || !isPlainObject(defaults)) continue
    for (const sub of Object.keys(v)) if (!(sub in defaults)) unknown.push(`${k}.${sub}`)
  }
  assert.deepStrictEqual(unknown, [], `example ships key(s) the engine ignores: ${unknown.join(', ')}`)

  // And prove it can fire, at both depths: the check is only worth having if a
  // stale key trips it.
  const stale = { ...example, open: { command: '' }, review: { ...example.review, publish: true } }
  const found = []
  for (const [k, v] of Object.entries(stale)) {
    if (!(k in DEFAULT_CONFIG)) { found.push(k); continue }
    if (!isPlainObject(v) || !isPlainObject(DEFAULT_CONFIG[k])) continue
    for (const sub of Object.keys(v)) if (!(sub in DEFAULT_CONFIG[k])) found.push(`${k}.${sub}`)
  }
  assert.deepStrictEqual(found.sort(), ['open', 'review.publish'])
})

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

test('worktree mode declares exactly one path', () => {
  assert.match(SKILL, /\*\*One path\./)
  assert.match(SKILL, /none should be added back/)
})

test('the skill says the session IS moved, and moved by a plain cd', () => {
  assert.match(SKILL, /The session moves into the worktree/)
  assert.doesNotMatch(SKILL, /The session does not move/)
  // The move is the `cd` already in the bootstrap command — no second mechanism.
  assert.match(SKILL, /\*\*moves this session\*\*/)
  assert.match(SKILL, /`cd` in\s*\n?step 3 is its whole mechanism/)
})

test('one path still means one path — no branch was added back to reach it', () => {
  assert.doesNotMatch(SKILL, /this session, no new window/)
  assert.doesNotMatch(SKILL, /hand off as before/)
  assert.match(SKILL, /nothing opens a window/)
})

test('the mechanics that actually reach the worktree all survived', () => {
  // These were once the FALLBACK branch and are now the only path. Deleting any
  // of them ends a start with nothing bootstrapped, or with writes going to the
  // primary checkout.
  for (const kept of [/cd "<worktreePath>"/, /git -C <worktreePath>/, /\/add-dir/]) {
    assert.match(SKILL, kept)
  }
})

test('the `git -C` prefix is kept on purpose, and says why', () => {
  // Once the session is in the worktree a bare `git` looks equivalent, so the
  // prefix reads like leftovers. It is not: it is the only thing that keeps a
  // silently-failed `cd` from writing the spec move onto the base branch.
  assert.match(SKILL, /\*\*Keep the `-C` prefix\*\*/)
  assert.match(SKILL, /do not\s*\n?\s*tidy it away/i)
})

test('the trust step is kept, and says why it is not tab machinery', () => {
  assert.match(SKILL, /Trust the worktree/)
  assert.match(SKILL, /worktrees live outside\s*\n?\s*the checkout/)
})

test('the move is asserted, never assumed', () => {
  // A `cd` that did not take leaves the session in the primary checkout on the
  // base branch, and the next thing to happen is a phase's worth of code. The
  // check is a POSITIVE signal (negative-checks.md rule 1) with a third state
  // routed to inaction (rule 4) — both halves have to be present or the skill is
  // reading silence as success.
  assert.match(SKILL, /confirm the move landed — never assume it/i)
  assert.match(SKILL, /spec-env resolve {8}# must name this spec/)
  assert.match(SKILL, /Three states, not two/)
  assert.match(SKILL, /the `cd` did not take/)
  assert.match(SKILL, /do not build a phase from a session whose location\s*\n?\s*you could not confirm/i)
})

test('/spec-next rules 1-3 are still declared unchanged', () => {
  // Loosening rule 2 is the tempting "fix" when a start lands somewhere else.
  // It was the wrong lever when the session moved and it still is — so the claim
  // is narrowed to the REFUSAL rather than dropped. An explicit --worktree path
  // is not a loosening of it: the refusal guards against guessing, and a path
  // someone typed is not a guess.
  assert.match(SKILL, /`\/spec-next`'s refusal is unchanged by this/)
  assert.match(SKILL, /nothing\s*\n?about rules 1 to 3 is loosened/i)
  assert.match(SKILL, /cannot be reached by\s*\n?guessing/i)
})

test('the rules file describes the move as a cd, not as machinery', () => {
  // The session moves again, so "never moves" is no longer the thing to pin.
  // What still has to be pinned is the MECHANISM — one `cd`, nothing spawned.
  assert.doesNotMatch(PLANNING, /moves\s*\n?the session you typed into/)
  assert.match(PLANNING, /moves your session into it/)
  assert.match(PLANNING, /plain `cd`/)
})

test('the README describes the same one path', () => {
  assert.doesNotMatch(README, /moves the session you\s*\n?\s*typed into/)
  assert.match(README, /moves your session into it/)
  assert.match(README, /nothing prompts and no window opens/)
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
