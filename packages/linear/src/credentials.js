'use strict'

/**
 * The Linear binding of the shared credentials store
 * (`@skitterbyte/skitterspec-provider-kit`, `src/credentials.js`) — one file per
 * machine at `$XDG_CONFIG_HOME/skitterspec/credentials.json`, keyed by Linear
 * team id so one file serves every checkout.
 *
 * The store machinery — schemas, permissions guards, keyCommand resolution —
 * lives in the kit; what stays here is only what is Linear's: the provider
 * name, the fact that v1 stores are this provider's (it predates the
 * namespace), the `lin_api_` key shape, and the wording of the refusals that
 * mention it.
 *
 * The API is unchanged: reads never throw, "no key" is a normal state, and
 * nothing here ever returns a key inside an error.
 */

const kit = require('@skitterbyte/skitterspec-provider-kit/src/credentials.js')

// v1 stores were only ever written by this provider — the store predates the
// namespace — so this binding owns them and keeps writing them in place. The
// first write by any OTHER provider migrates the file to v2.
const store = kit.makeCredentialsStore({ provider: 'linear', legacyV1Owner: 'linear' })

// Linear personal API keys are `lin_api_` + a long token.
const LITERAL_KEY_RE = /lin_api_[A-Za-z0-9]{8,}/

const LITERAL_KEY_ADVICE =
  'that command has a Linear key written into it.\n' +
  '  A command is displayed by `credentials status` and is not treated as a\n' +
  '  secret — embedding a key there exposes it. To store a key, run\n' +
  '  `credentials set` with no arguments and paste at the hidden prompt.'

const keyForTeam = (s, teamId) => store.keyFor(s, teamId)
const userForTeam = (s, teamId) => store.userFor(s, teamId)
const resolveTeamKey = (s, teamId, deps) => store.resolveKey(s, teamId, deps)
const writeKey = (file, teamId, key, deps) => store.writeKey(file, teamId, key, deps)
const writeUser = (file, teamId, user, deps) => store.writeUser(file, teamId, user, deps)
const removeKey = (file, teamId, deps) => store.removeKey(file, teamId, deps)
const removeUser = (file, teamId, deps) => store.removeUser(file, teamId, deps)
const writeKeyCommand = (file, teamId, command, deps) =>
  store.writeKeyCommand(file, teamId, command, deps, {
    literalKeyRe: LITERAL_KEY_RE,
    literalKeyAdvice: LITERAL_KEY_ADVICE,
  })

module.exports = {
  storePath: kit.storePath,
  readStore: kit.readStore,
  keyForTeam,
  userForTeam,
  fingerprint: kit.fingerprint,
  writeKey,
  writeUser,
  writeKeyCommand,
  resolveTeamKey,
  removeKey,
  removeUser,
  storeMode: kit.storeMode,
  DIR_NAME: kit.DIR_NAME,
  FILE_NAME: kit.FILE_NAME,
}
