'use strict'

/**
 * The GitHub binding of the shared credentials store
 * (`@skitterbyte/skitterspec-provider-kit`, `src/credentials.js`) — one file
 * per machine at `$XDG_CONFIG_HOME/skitterspec/credentials.json`, this
 * provider's entries keyed by `github.com/<owner>` so one token serves every
 * repo that owner holds.
 *
 * The credential is a bare token string (a classic PAT with `repo` +
 * `project`), on exactly the terms the Linear key is: never logged, never in an
 * error, never in argv.
 *
 * Environment wins over the store: `auth.tokenEnv` (GITHUB_TOKEN by default),
 * then GH_TOKEN — the name the GitHub CLI itself reads, which a machine with
 * `gh` configured often already exports.
 */

const kit = require('@skitterbyte/skitterspec-provider-kit/src/credentials.js')
const { DEFAULT_TOKEN_ENV, FALLBACK_TOKEN_ENV } = require('./config.js')

// v1 stores were only ever written by the Linear provider (the store predates
// the namespace), so this binding is NOT their owner: its first write migrates
// a v1 file to the namespaced v2 shape, folding the old entries under linear.
const store = kit.makeCredentialsStore({ provider: 'github', legacyV1Owner: 'linear' })

// A GitHub token pasted where a command belongs: classic (`ghp_`), OAuth
// (`gho_`), user-to-server (`ghu_`), server-to-server (`ghs_`), refresh
// (`ghr_`), and fine-grained (`github_pat_`).
const LITERAL_TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/

const LITERAL_TOKEN_ADVICE =
  'that command has a GitHub token written into it.\n' +
  '  A command is displayed by `credentials status` and is not treated as a\n' +
  '  secret — embedding a token there exposes it. To store a token, run\n' +
  '  `credentials set` with no arguments and paste at the hidden prompt.'

// The store scope for a config: the OWNER, not the repo — a classic PAT is an
// account's, and every repo that account holds is reached by the same one.
const scopeOf = (config) => {
  const owner = config && config.github && config.github.owner
  return owner ? `github.com/${String(owner).toLowerCase()}` : ''
}

/**
 * Resolve the token: environment first, then the store.
 *
 * @returns {{ ok: true, token, source, envVar? } | { ok: false, error, envVars }}
 *   `source` is `'env'`, `'store'` or `'command'`. The error names what was
 *   looked for and where; it never contains a token.
 */
function resolveCredential(config, env = process.env, deps = {}) {
  const tokenEnv = (config && config.auth && config.auth.tokenEnv) || DEFAULT_TOKEN_ENV
  const envVars = tokenEnv === FALLBACK_TOKEN_ENV ? [tokenEnv] : [tokenEnv, FALLBACK_TOKEN_ENV]
  for (const name of envVars) {
    const token = (env[name] || '').trim()
    if (token) return { ok: true, token, source: 'env', envVar: name, envVars }
  }

  const scope = scopeOf(config)
  const file = (deps.storePath || kit.storePath)(env)
  if (scope) {
    const read = (deps.readStore || kit.readStore)(file)
    if (read.ok) {
      const got = store.resolveKey(read.store, scope, deps)
      if (got.key) return { ok: true, token: got.key, source: got.source, path: file, envVars }
      if (got.reason) return { ok: false, error: got.reason, envVars, path: file }
    } else if (read.code !== 'absent') {
      return { ok: false, error: read.reason, envVars, path: file }
    }
  }

  return {
    ok: false,
    error:
      `no GitHub token: set ${envVars.join(' or ')}, or run ` +
      '`skitterspec-github spec-sync credentials set`' +
      (scope ? '' : ' (and set github.owner, which keys the stored token)'),
    envVars,
    path: file,
  }
}

const writeCredential = (file, scope, token, deps) => store.writeKey(file, scope, token, deps)
const userForScope = (s, scope) => store.userFor(s, scope)
const writeUser = (file, scope, user, deps) => store.writeUser(file, scope, user, deps)
const removeUser = (file, scope, deps) => store.removeUser(file, scope, deps)
const removeCredential = (file, scope, deps) => store.removeKey(file, scope, deps)
const writeKeyCommand = (file, scope, command, deps) =>
  store.writeKeyCommand(file, scope, command, deps, {
    literalKeyRe: LITERAL_TOKEN_RE,
    literalKeyAdvice: LITERAL_TOKEN_ADVICE,
  })

module.exports = {
  storePath: kit.storePath,
  readStore: kit.readStore,
  storeMode: kit.storeMode,
  fingerprint: kit.fingerprint,
  resolveCredential,
  scopeOf,
  writeCredential,
  userForScope,
  writeUser,
  removeUser,
  removeCredential,
  writeKeyCommand,
  LITERAL_TOKEN_RE,
}
