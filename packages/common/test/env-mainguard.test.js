'use strict'

/**
 * The main guard — a check that stops someone working, so most of this file is
 * the half that proves it stays quiet.
 *
 * `.claude/rules/negative-checks.md` rule 3 asks for a stays-silent test per
 * accusing check, fed a healthy-but-unusual input. This one fires on an `Edit`,
 * which is the commonest tool call there is, so "unusual" covers a great deal:
 * a worktree, a spec branch, a repo with no isolation, a project that switched
 * it off, a session holding an allow. Each has a test below, and each asserts
 * the guard says NOTHING rather than merely not refusing.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  allowApplies,
  judgeMainWrite,
  readAllow,
  recordAllow,
  clearAllow,
  mainGuardStatus,
  allowPath,
} = require('../src/env/mainguard.js')

const CONFIG = { registry: '.spec-env/registry.json', guards: {} }
const tmpDir = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-guard-')))

// Every part present and true — the only shape that refuses.
const FIRES = {
  configured: true,
  enabled: true,
  isPrimary: true,
  onBase: true,
  allow: null,
  sessionId: 'S1',
}

// --- it can fire -------------------------------------------------------------

test('the primary checkout on the base branch is refused', () => {
  const v = judgeMainWrite(FIRES)
  assert.strictEqual(v.refuse, true)
  assert.match(v.reason, /the base branch is a landing zone/)
})

test('the refusal names both exits, and says which one is the user’s', () => {
  // A gate with no route onward gets switched off wholesale instead of answered,
  // which is the failure `review-gate.cjs`'s own header records.
  const { reason } = judgeMainWrite(FIRES)
  assert.match(reason, /\/no-spec <name>/)
  assert.match(reason, /\/spec-start <name>/)
  assert.match(reason, /the USER types \/allow-main/)
  assert.match(reason, /it is theirs to run, not yours/)
})

test('it never inspects the file being written', () => {
  // The allowlist is empty BY CONSTRUCTION: /spec authors into its own worktree
  // and /no-spec catches ad-hoc work, so nothing legitimate writes here. A path
  // argument would be the beginning of an exception list.
  assert.strictEqual(judgeMainWrite.length, 1, 'one argument: the context, never a path')
})

// ---------------------------------------------------------------------------
// STAYS SILENT — one per part of the positive signal, plus the allow.
// ---------------------------------------------------------------------------

test('STAYS SILENT: a repo with no isolation config', () => {
  const v = judgeMainWrite({ ...FIRES, configured: false })
  assert.deepStrictEqual(v, { refuse: false, reason: null })
})

test('STAYS SILENT: a project that switched the guard off', () => {
  const v = judgeMainWrite({ ...FIRES, enabled: false })
  assert.deepStrictEqual(v, { refuse: false, reason: null })
})

test('STAYS SILENT: a worktree, which is somebody’s spec branch', () => {
  const v = judgeMainWrite({ ...FIRES, isPrimary: false })
  assert.deepStrictEqual(v, { refuse: false, reason: null })
})

test('STAYS SILENT: the primary checkout on a spec branch', () => {
  // Live overlay checks a spec out here deliberately. Refusing then would break
  // the one workflow that is SUPPOSED to write in the primary checkout.
  const v = judgeMainWrite({ ...FIRES, onBase: false })
  assert.deepStrictEqual(v, { refuse: false, reason: null })
})

test('STAYS SILENT: an allow for this session', () => {
  const allow = { scope: 'session', session: 'S1' }
  assert.deepStrictEqual(judgeMainWrite({ ...FIRES, allow }), { refuse: false, reason: null })
})

test('STAYS SILENT: a repo-scoped allow, whoever is asking', () => {
  const allow = { scope: 'repo' }
  assert.deepStrictEqual(
    judgeMainWrite({ ...FIRES, allow, sessionId: null }),
    { refuse: false, reason: null },
  )
})

test('an empty context refuses nothing rather than everything', () => {
  // The guard is reached with whatever the caller could establish, so the
  // no-facts case must be the harmless one.
  assert.deepStrictEqual(judgeMainWrite(), { refuse: false, reason: null })
  assert.deepStrictEqual(judgeMainWrite({}), { refuse: false, reason: null })
})

// --- the allow, and what "temporary" has to mean ----------------------------

test('a session allow does not apply to another session', () => {
  const allow = { scope: 'session', session: 'S1' }
  assert.strictEqual(allowApplies(allow, 'S1'), true)
  assert.strictEqual(allowApplies(allow, 'S2'), false)
})

test('a session allow with no session id to compare does not apply', () => {
  // Otherwise every session allow silently becomes a repo one the moment a
  // caller forgets to pass the id.
  assert.strictEqual(allowApplies({ scope: 'session', session: 'S1' }, null), false)
  assert.strictEqual(allowApplies({ scope: 'session', session: 'S1' }, ''), false)
})

test('an unrecognised scope does not permit anything', () => {
  for (const allow of [{}, { scope: 'forever' }, { scope: null }, null]) {
    assert.strictEqual(allowApplies(allow, 'S1'), false, JSON.stringify(allow))
  }
})

test('a missing or malformed allow file reads as no allow', () => {
  // The STRICT answer, and it is right here only because strict is also safe:
  // being wrong costs a refusal that names two exits, where the lenient reading
  // would let a corrupt file switch the guard off forever.
  const dir = tmpDir()
  assert.strictEqual(readAllow(dir, CONFIG), null)
  const file = allowPath(dir, CONFIG)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'not json')
  assert.strictEqual(readAllow(dir, CONFIG), null)
  fs.writeFileSync(file, '["an array"]')
  assert.strictEqual(readAllow(dir, CONFIG), null)
})

test('recording with a session id makes a session allow, without one a repo allow', () => {
  const dir = tmpDir()
  const s = recordAllow(dir, CONFIG, { sessionId: 'S1', reason: 'by hand', at: 'T' })
  assert.deepStrictEqual(s, { scope: 'session', session: 'S1', reason: 'by hand', at: 'T' })
  assert.deepStrictEqual(readAllow(dir, CONFIG), s)

  const r = recordAllow(dir, CONFIG, { reason: null, at: 'T' })
  assert.strictEqual(r.scope, 'repo')
})

test('clearing is idempotent', () => {
  const dir = tmpDir()
  recordAllow(dir, CONFIG, { sessionId: 'S1', at: 'T' })
  assert.strictEqual(clearAllow(dir, CONFIG), true)
  assert.strictEqual(clearAllow(dir, CONFIG), false, 'nothing to clear is not an error')
  assert.strictEqual(readAllow(dir, CONFIG), null)
})

// --- status reports all four states -----------------------------------------

test('status names the state, and which kind of allow is in force', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(mainGuardStatus(dir, CONFIG, { present: true }), { state: 'guarded' })

  recordAllow(dir, CONFIG, { sessionId: 'S1', reason: 'lockfile', at: 'T' })
  assert.deepStrictEqual(mainGuardStatus(dir, CONFIG, { present: true, sessionId: 'S1' }), {
    state: 'allowed',
    scope: 'session',
    reason: 'lockfile',
    at: 'T',
  })
})

test('an allow belonging to another session is reported, not hidden', () => {
  // A bare "guarded" would send someone hunting for why their /allow-main did
  // nothing — the answer is that it belongs to a different conversation.
  const dir = tmpDir()
  recordAllow(dir, CONFIG, { sessionId: 'S1', at: 'T' })
  assert.deepStrictEqual(mainGuardStatus(dir, CONFIG, { present: true, sessionId: 'S2' }), {
    state: 'guarded',
    otherSession: true,
  })
})

test('status distinguishes off from unconfigured', () => {
  // Two different facts about the repo: one project decided, the other never
  // adopted isolation at all.
  const dir = tmpDir()
  assert.deepStrictEqual(mainGuardStatus(dir, CONFIG, { present: false }), {
    state: 'unconfigured',
  })
  assert.deepStrictEqual(
    mainGuardStatus(dir, { ...CONFIG, guards: { mainIsLandingZone: false } }, { present: true }),
    { state: 'off' },
  )
})

// --- the config key ----------------------------------------------------------

test('the guard is on by default wherever isolation is configured', () => {
  const { DEFAULT_CONFIG } = require('../src/env/config.js')
  assert.strictEqual(DEFAULT_CONFIG.guards.mainIsLandingZone, true)
})

test('a project can switch it off, and only with a boolean', () => {
  const { loadEnvConfig } = require('../src/env/config.js')
  const dir = tmpDir()
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  const write = (v) =>
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ guards: { mainIsLandingZone: v } }),
    )

  write(false)
  assert.strictEqual(loadEnvConfig(dir).config.guards.mainIsLandingZone, false)
  // A string is not a boolean, and the merge drops it rather than coercing —
  // so a mistyped `"false"` leaves the guard ON, which is the safe way to be
  // wrong about a value nobody can see.
  write('false')
  assert.strictEqual(loadEnvConfig(dir).config.guards.mainIsLandingZone, true)
})
