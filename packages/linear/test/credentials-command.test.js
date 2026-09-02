'use strict'

/**
 * `keyCommand` — delegating to a password manager so nothing is stored.
 *
 * The security property under test is the TRUST BOUNDARY: a command is honoured
 * only from the user-level store, never from the repo's committed
 * `linear.config.json`. That file travels with the repo, so a command named
 * there would execute on the machine of anyone who cloned it and ran spec-sync.
 *
 * The boundary test asserts NON-EXECUTION via a sentinel file, not merely that
 * the resolved key was null — a null could be produced for the wrong reason
 * (command ran and failed), which would pass a weaker test while the hole was
 * wide open.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveTeamKey, writeKeyCommand, readStore } = require('../src/credentials.js')
const { resolveApiKey } = require('../src/api.js')
const { specSync } = require('../src/cli-sync.js')

const TEAM = 'team-abc'

function tmp(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skitterspec-${tag}-`))
}

test('a keyCommand resolves the key from its stdout', () => {
  const r = resolveTeamKey({ teams: { [TEAM]: { keyCommand: 'echo lin_api_fromcmd' } } }, TEAM)
  assert.strictEqual(r.key, 'lin_api_fromcmd')
  assert.strictEqual(r.source, 'command')
})

test('a stored key beats a keyCommand, so the command is not run needlessly', () => {
  const sentinel = path.join(tmp('sentinel'), 'ran')
  const r = resolveTeamKey(
    { teams: { [TEAM]: { key: 'direct', keyCommand: `touch ${sentinel}` } } },
    TEAM,
  )
  assert.strictEqual(r.key, 'direct')
  assert.strictEqual(r.source, 'store')
  assert.ok(!fs.existsSync(sentinel), 'the command was never executed')
})

test('a failing command falls back to no key, but reports why', () => {
  const r = resolveTeamKey({ teams: { [TEAM]: { keyCommand: 'echo boom >&2; exit 3' } } }, TEAM)
  assert.strictEqual(r.key, null, 'no key is the normal MCP fallback')
  assert.match(r.reason, /keyCommand failed/)
  assert.match(r.reason, /boom/, 'carries stderr so it is diagnosable')
})

test('a command that prints nothing is a reported no-key, not a blank key', () => {
  const r = resolveTeamKey({ teams: { [TEAM]: { keyCommand: 'true' } } }, TEAM)
  assert.strictEqual(r.key, null)
  assert.match(r.reason, /no output/)
})

test("a failing command's stdout never reaches the error", () => {
  // A command can print a secret to stdout and still exit non-zero. Read it from
  // a file so the secret is genuinely only in stdout, never in the command text
  // (which IS reported, being user-authored and not a secret).
  const dir = tmp('leak')
  const secretFile = path.join(dir, 'secret')
  fs.writeFileSync(secretFile, 'lin_api_LEAKED9999')
  const r = resolveTeamKey(
    { teams: { [TEAM]: { keyCommand: `cat ${secretFile}; echo failed >&2; exit 1` } } },
    TEAM,
  )
  assert.strictEqual(r.key, null)
  assert.doesNotMatch(JSON.stringify(r), /LEAKED/, 'stdout is the key — never in a diagnostic')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a command with a key written into it is refused, not stored', () => {
  // Refusing --key makes this the obvious workaround, and it is worse: the
  // command is echoed by `status` and stored in clear.
  const file = path.join(tmp('embedded'), 'credentials.json')
  const r = writeKeyCommand(file, TEAM, 'echo lin_api_abcdefgh12345')
  assert.strictEqual(r.ok, false)
  assert.match(r.reason, /has a Linear key written into it/)
  assert.match(r.reason, /credentials set/, 'points at the right way to do it')
  assert.ok(!fs.existsSync(file), 'and nothing was written')
})

test('writeKeyCommand replaces a stored key, so the command actually runs', () => {
  const file = path.join(tmp('wkc'), 'credentials.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ version: 1, teams: { [TEAM]: { key: 'old' } } }), { mode: 0o600 })
  assert.ok(writeKeyCommand(file, TEAM, 'echo new').ok)
  const store = readStore(file).store
  assert.ok(!store.teams[TEAM].key, 'the stale key is gone, not left to win silently')
  assert.strictEqual(store.teams[TEAM].keyCommand, 'echo new')
})

// --- the trust boundary -----------------------------------------------------

test('a keyCommand in the COMMITTED repo config is never executed', async () => {
  const dir = tmp('repo')
  const xdg = tmp('xdg')
  const sentinel = path.join(dir, 'EXECUTED')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({
      linear: { teamKey: 'SKS', teamId: TEAM },
      auth: { keyCommand: `touch ${sentinel}` },
    }),
  )

  let out = ''
  const code = await specSync(['credentials', 'status', '--dir', dir], {
    out: { write: (c) => ((out += c), true) },
    err: { write: () => true },
    env: { XDG_CONFIG_HOME: xdg },
  })

  assert.ok(!fs.existsSync(sentinel), 'THE COMMAND MUST NOT RUN — this is the whole boundary')
  assert.notStrictEqual(code, 0, 'and no key was resolved from it')
  assert.match(out, /is IGNORED/, 'says it was ignored')
  assert.match(out, /committed/, 'and why, so it does not read as a bug')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(xdg, { recursive: true, force: true })
})

test('resolveApiKey surfaces a keyCommand failure rather than reporting no key set', () => {
  const xdg = tmp('xdg2')
  const file = path.join(xdg, 'skitterspec', 'credentials.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ version: 1, teams: { [TEAM]: { keyCommand: 'exit 9' } } }), {
    mode: 0o600,
  })
  const r = resolveApiKey({ linear: { teamId: TEAM } }, { XDG_CONFIG_HOME: xdg })
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /keyCommand failed/, 'a broken command is not silent')
  fs.rmSync(xdg, { recursive: true, force: true })
})
