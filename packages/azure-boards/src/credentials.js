'use strict'

/**
 * The Azure Boards binding of the shared credentials store
 * (`@skitterbyte/skitterspec-provider-kit`, `src/credentials.js`) — one file
 * per machine at `$XDG_CONFIG_HOME/skitterspec/credentials.json`, this
 * provider's entries keyed by ORGANIZATION URL so one store serves every
 * checkout.
 *
 * Azure DevOps authenticates with a Personal Access Token over basic auth —
 * an empty username and the PAT as the password — so the stored credential is
 * a bare string, like Linear's and unlike Jira's compound. The env var wins
 * over the store, and its default name is the official CLI's
 * (`AZURE_DEVOPS_EXT_PAT`), so a machine already set up for `az boards` needs
 * nothing new.
 */

const kit = require('@skitterbyte/skitterspec-provider-kit/src/credentials.js')

// v1 stores were only ever written by the Linear provider (the store predates
// the namespace), so this binding is NOT their owner: its first write migrates
// a v1 file to the namespaced v2 shape, folding the old entries under linear.
const store = kit.makeCredentialsStore({ provider: 'azure-boards', legacyV1Owner: 'linear' })

// A PAT pasted where a command belongs. ADO tokens are long unbroken
// alphanumeric runs (52 chars classically, longer for the newer format); an
// ordinary command has no 50+-character bare token in it.
const LITERAL_TOKEN_RE = /\b[A-Za-z0-9]{50,}\b/

const LITERAL_TOKEN_ADVICE =
  'that command has what looks like an Azure DevOps PAT written into it.\n' +
  '  A command is displayed by `credentials status` and is not treated as a\n' +
  '  secret — embedding a token there exposes it. To store credentials, run\n' +
  '  `credentials set` with no arguments and paste at the hidden prompt.'

const orgOf = (config) => (config && config.azure && config.azure.orgUrl) || ''

/**
 * Resolve the PAT: environment first, then the store.
 *
 * @returns {{ ok: true, token, source } | { ok: false, error, envVars }}
 *   `source` is `'env'` or `'store'`. The error names what was looked for and
 *   where; it never contains a token.
 */
function resolveCredential(config, env = process.env, deps = {}) {
  const tokenEnv = (config && config.auth && config.auth.tokenEnv) || 'AZURE_DEVOPS_EXT_PAT'
  const token = (env[tokenEnv] || '').trim()
  if (token) return { ok: true, token, source: 'env', envVars: [tokenEnv] }

  const org = orgOf(config)
  const file = (deps.storePath || kit.storePath)(env)
  let commandReason = ''
  if (org) {
    const read = (deps.readStore || kit.readStore)(file)
    if (read.ok) {
      // A PAT is a bare string, so it resolves like Linear's key — a stored
      // value first, else the entry's `keyCommand` (user-level store only).
      const resolved = store.resolveKey(read.store, org, deps)
      if (resolved.key) {
        return { ok: true, token: resolved.key, source: 'store', path: file }
      }
      if (resolved.reason) commandReason = `\n  (${resolved.reason})`
    } else if (read.code !== 'absent') {
      return { ok: false, error: read.reason, envVars: [tokenEnv], path: file }
    }
  }

  return {
    ok: false,
    error:
      `no Azure DevOps credentials: set ${tokenEnv}, or run ` +
      `\`skitterspec-azure-boards spec-sync credentials set\`${commandReason}`,
    envVars: [tokenEnv],
    path: file,
  }
}

// The basic-auth header value for a resolved credential: empty user, PAT as
// the password — the shape every ADO client uses.
function authHeader({ token }) {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`
}

const writeCredential = (file, org, token, deps) => store.writeKey(file, org, token, deps)
const userForOrg = (s, org) => store.userFor(s, org)
const writeUser = (file, org, user, deps) => store.writeUser(file, org, user, deps)
const removeUser = (file, org, deps) => store.removeUser(file, org, deps)
const removeCredential = (file, org, deps) => store.removeKey(file, org, deps)
const writeKeyCommand = (file, org, command, deps) =>
  store.writeKeyCommand(file, org, command, deps, {
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
  orgOf,
  writeCredential,
  userForOrg,
  writeUser,
  removeUser,
  removeCredential,
  writeKeyCommand,
}
