'use strict'

/**
 * The user-level credentials store, and its place in the resolution chain.
 *
 * Two properties matter more than the mechanics and are asserted throughout:
 *   1. The environment variable still WINS, so CI and every existing setup are
 *      untouched by this feature.
 *   2. A key never appears in an error, a reason, or any returned diagnostic.
 *      The whole point of the store is that the secret stops travelling.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { storePath, readStore, keyForTeam, fingerprint } = require('../src/credentials.js')
const { resolveApiKey } = require('../src/api.js')

const TEAM = 'e07c2b54-team'
const SECRET = 'lin_api_supersecret9999'

// A real store on disk under a throwaway XDG root, so mode checks are genuine.
function withStore(contents, mode = 0o600) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cred-'))
  const file = path.join(root, 'skitterspec', 'credentials.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
  fs.chmodSync(file, mode)
  return { root, file, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

const config = { linear: { teamId: TEAM }, auth: { keyEnv: 'LINEAR_API_KEY' } }

// --- location ---------------------------------------------------------------

test('storePath honours XDG_CONFIG_HOME, else ~/.config', () => {
  assert.strictEqual(
    storePath({ XDG_CONFIG_HOME: '/xdg' }, () => '/home/u'),
    path.join('/xdg', 'skitterspec', 'credentials.json'),
  )
  assert.strictEqual(
    storePath({}, () => '/home/u'),
    path.join('/home/u', '.config', 'skitterspec', 'credentials.json'),
  )
})

test('a blank XDG_CONFIG_HOME falls back rather than resolving to a bare path', () => {
  assert.strictEqual(
    storePath({ XDG_CONFIG_HOME: '   ' }, () => '/home/u'),
    path.join('/home/u', '.config', 'skitterspec', 'credentials.json'),
  )
})

// --- reading ----------------------------------------------------------------

test('a missing store is the normal default, not an error', () => {
  const r = readStore('/definitely/not/here.json')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'absent', 'absent is its own code, so callers can ignore it')
})

test('a group- or world-readable store is refused, naming the chmod', () => {
  const s = withStore({ teams: { [TEAM]: { key: SECRET } } }, 0o644)
  try {
    const r = readStore(s.file)
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.code, 'permissions')
    assert.match(r.reason, /mode 644/)
    assert.match(r.reason, new RegExp(`chmod 600 ${s.file.replace(/\//g, '\\/')}`))
    assert.doesNotMatch(r.reason, /supersecret/, 'refusing must not echo the key')
  } finally {
    s.cleanup()
  }
})

test('malformed JSON is reported clearly, not thrown', () => {
  const s = withStore('{ not json')
  try {
    const r = readStore(s.file)
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.code, 'malformed')
  } finally {
    s.cleanup()
  }
})

test('keyForTeam returns null for an unknown team or an empty key', () => {
  const store = { teams: { [TEAM]: { key: '   ' }, other: { key: 'x' } } }
  assert.strictEqual(keyForTeam(store, TEAM), null, 'whitespace is not a key')
  assert.strictEqual(keyForTeam(store, 'nobody'), null)
  assert.strictEqual(keyForTeam(store, ''), null)
  assert.strictEqual(keyForTeam({}, TEAM), null)
})

// --- resolution order -------------------------------------------------------

test('the environment wins over the store, so CI is untouched', () => {
  const s = withStore({ teams: { [TEAM]: { key: SECRET } } })
  try {
    const r = resolveApiKey(config, { LINEAR_API_KEY: 'from-env', XDG_CONFIG_HOME: s.root })
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.key, 'from-env')
    assert.strictEqual(r.source, 'env')
  } finally {
    s.cleanup()
  }
})

test('the store is used when the environment has no key', () => {
  const s = withStore({ teams: { [TEAM]: { key: SECRET } } })
  try {
    const r = resolveApiKey(config, { XDG_CONFIG_HOME: s.root })
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.key, SECRET)
    assert.strictEqual(r.source, 'store', 'reports where it came from')
  } finally {
    s.cleanup()
  }
})

test('an empty environment variable falls through rather than counting as set', () => {
  const s = withStore({ teams: { [TEAM]: { key: SECRET } } })
  try {
    const r = resolveApiKey(config, { LINEAR_API_KEY: '  ', XDG_CONFIG_HOME: s.root })
    assert.strictEqual(r.source, 'store')
  } finally {
    s.cleanup()
  }
})

test('a store for a DIFFERENT team is not used', () => {
  const s = withStore({ teams: { 'some-other-team': { key: SECRET } } })
  try {
    const r = resolveApiKey(config, { XDG_CONFIG_HOME: s.root })
    assert.strictEqual(r.ok, false, 'no key for this team')
  } finally {
    s.cleanup()
  }
})

test('no key at all reports every way to set one, and stays a normal state', () => {
  const r = resolveApiKey(config, { XDG_CONFIG_HOME: '/nowhere' })
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /LINEAR_API_KEY/, 'names the env var')
  assert.match(r.error, /credentials\.json/, 'names the store file')
  assert.match(r.error, /credentials set/, 'names the command that stores one')
  assert.match(r.error, /--via mcp/, 'still offers the MCP fallback')
})

test('an unusable store is surfaced, not silently read as "no key set"', () => {
  // A permissions refusal that degraded to the generic message would hide the
  // leak — the user would set the key again and never learn the file is exposed.
  const s = withStore({ teams: { [TEAM]: { key: SECRET } } }, 0o644)
  try {
    const r = resolveApiKey(config, { XDG_CONFIG_HOME: s.root })
    assert.strictEqual(r.ok, false)
    assert.match(r.error, /readable by other users/)
    assert.match(r.error, /chmod 600/)
  } finally {
    s.cleanup()
  }
})

// --- the secret never travels ----------------------------------------------

test('no failure path ever puts the key in an error or diagnostic', () => {
  const cases = [
    () => withStore({ teams: { [TEAM]: { key: SECRET } } }, 0o644),
    () => withStore({ teams: { [TEAM]: { key: SECRET } } }, 0o604),
    () => withStore(`{ "teams": { "${TEAM}": { "key": "${SECRET}" } }`),
  ]
  for (const make of cases) {
    const s = make()
    try {
      const serialised = [
        JSON.stringify(readStore(s.file)),
        JSON.stringify(resolveApiKey(config, { XDG_CONFIG_HOME: s.root })),
      ].join(' ')
      assert.doesNotMatch(serialised, /supersecret/, 'the key must not appear in any diagnostic')
    } finally {
      s.cleanup()
    }
  }
})

test('fingerprint reveals only the last four characters', () => {
  assert.strictEqual(fingerprint(SECRET), '…9999')
  assert.strictEqual(fingerprint(''), null)
  assert.doesNotMatch(String(fingerprint(SECRET)), /supersecret/)
})

test('with no teamId configured the store is never read at all', () => {
  // Not just "no key found": the file must not be touched. Otherwise every unit
  // test using the default config reads the developer's real ~/.config, and the
  // suite's result depends on whose machine it runs on.
  let touched = false
  const r = resolveApiKey(
    { auth: { keyEnv: 'LINEAR_API_KEY' } },
    {},
    {
      storePath: () => {
        touched = true
        return '/unused'
      },
      readStore: () => {
        touched = true
        return { ok: false, code: 'absent' }
      },
    },
  )
  assert.strictEqual(r.ok, false)
  assert.strictEqual(touched, false, 'no store lookup without a team to key it by')
})
