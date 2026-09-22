'use strict'

/**
 * The Jira binding of the shared credentials store
 * (`@skitterbyte/skitterspec-provider-kit`, `src/credentials.js`) — one file
 * per machine at `$XDG_CONFIG_HOME/skitterspec/credentials.json`, this
 * provider's entries keyed by SITE URL so one store serves every checkout.
 *
 * Jira Cloud authenticates with an email + API-token pair (basic auth), so the
 * stored credential is COMPOUND — `{ email, token }` — where Linear's is a
 * bare string. The kit store passes compounds through opaquely
 * (`credentialFor`), and the token half is a secret on exactly the same terms
 * as a key: never logged, never in an error, never in argv.
 *
 * Environment wins over the store: `auth.emailEnv` + `auth.tokenEnv` (both
 * required — an email without a token authenticates nothing).
 */

const kit = require('@skitterbyte/skitterspec-provider-kit/src/credentials.js')

// v1 stores were only ever written by the Linear provider (the store predates
// the namespace), so this binding is NOT their owner: its first write migrates
// a v1 file to the namespaced v2 shape, folding the old entries under linear.
const store = kit.makeCredentialsStore({ provider: 'jira', legacyV1Owner: 'linear' })

// An Atlassian API token pasted where a command belongs. Tokens are opaque
// strings; the modern ones carry this prefix.
const LITERAL_TOKEN_RE = /ATATT[A-Za-z0-9_=-]{8,}/

const LITERAL_TOKEN_ADVICE =
  'that command has a Jira API token written into it.\n' +
  '  A command is displayed by `credentials status` and is not treated as a\n' +
  '  secret — embedding a token there exposes it. To store credentials, run\n' +
  '  `credentials set` with no arguments and paste at the hidden prompt.'

const siteOf = (config) => (config && config.jira && config.jira.siteUrl) || ''

/**
 * Resolve the email + token pair: environment first, then the store.
 *
 * @returns {{ ok: true, email, token, source } | { ok: false, error, envVars }}
 *   `source` is `'env'` or `'store'`. The error names what was looked for and
 *   where; it never contains a token.
 */
function resolveCredential(config, env = process.env, deps = {}) {
  const emailEnv = (config && config.auth && config.auth.emailEnv) || 'JIRA_EMAIL'
  const tokenEnv = (config && config.auth && config.auth.tokenEnv) || 'JIRA_API_TOKEN'
  const email = (env[emailEnv] || '').trim()
  const token = (env[tokenEnv] || '').trim()
  if (email && token) return { ok: true, email, token, source: 'env', envVars: [emailEnv, tokenEnv] }

  const site = siteOf(config)
  const file = (deps.storePath || kit.storePath)(env)
  if (site) {
    const read = (deps.readStore || kit.readStore)(file)
    if (read.ok) {
      const cred = store.credentialFor(read.store, site)
      if (cred && typeof cred.email === 'string' && typeof cred.token === 'string' && cred.email && cred.token) {
        return { ok: true, email: cred.email, token: cred.token, source: 'store', path: file }
      }
    } else if (read.code !== 'absent') {
      return { ok: false, error: read.reason, envVars: [emailEnv, tokenEnv], path: file }
    }
  }

  const half = email || token ? `\n  (${email ? tokenEnv : emailEnv} is unset — both are required)` : ''
  return {
    ok: false,
    error:
      `no Jira credentials: set ${emailEnv} and ${tokenEnv}, or run ` +
      `\`skitterspec-jira spec-sync credentials set\`${half}`,
    envVars: [emailEnv, tokenEnv],
    path: file,
  }
}

// The basic-auth header value for a resolved credential.
function authHeader({ email, token }) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
}

const writeCredential = (file, site, email, token, deps) =>
  store.writeKey(file, site, { email, token }, deps)
const userForSite = (s, site) => store.userFor(s, site)
const writeUser = (file, site, user, deps) => store.writeUser(file, site, user, deps)
const removeUser = (file, site, deps) => store.removeUser(file, site, deps)
const removeCredential = (file, site, deps) => store.removeKey(file, site, deps)
const writeKeyCommand = (file, site, command, deps) =>
  store.writeKeyCommand(file, site, command, deps, {
    literalKeyRe: LITERAL_TOKEN_RE,
    literalKeyAdvice: LITERAL_TOKEN_ADVICE,
  })

module.exports = {
  storePath: kit.storePath,
  readStore: kit.readStore,
  storeMode: kit.storeMode,
  fingerprint: kit.fingerprint,
  resolveCredential,
  authHeader,
  siteOf,
  writeCredential,
  userForSite,
  writeUser,
  removeUser,
  removeCredential,
  writeKeyCommand,
}
