'use strict'

/**
 * "Who am I on Azure DevOps?" — the Azure binding of the kit's identity
 * resolver (`provider-kit/src/identity.js`: store → viewer → unknown, unknown
 * being a normal state).
 *
 * The answer is DERIVED from the PAT: a Personal Access Token belongs to a
 * person, and `connectionData` names them without any scope beyond the token
 * being valid (phase 1 spike). The id is the uniqueName/email — the one form
 * `System.AssignedTo` accepts. The identity GUID was cached here once, on the
 * belief Azure took both; a live write refused it as an "unknown identity"
 * (bug-azure-boards-adoption-fixes), so the GUID survives only for an
 * identity with no account property at all.
 */

const { resolveIdentity: kitResolveIdentity, defaultDisplayName } = require('@skitterbyte/skitterspec-provider-kit/src/identity.js')
const { makeApiAdapter } = require('./api.js')
const { storePath, readStore, userForOrg, resolveCredential, orgOf } = require('./credentials.js')

async function resolveIdentity(config, env = process.env, deps = {}) {
  const file = (deps.storePath || storePath)(env)
  return kitResolveIdentity({
    scopeId: orgOf(config),
    file,
    readStore: (f) => (deps.readStore || readStore)(f),
    userFor: (store, id) => userForOrg(store, id),
    // An injected adapter needs no token — the test seam, and nothing else.
    resolveCredential: () => (deps.adapter ? { ok: true } : resolveCredential(config, env)),
    readViewer: (cred) => {
      const a = (config && config.azure) || {}
      const adapter =
        deps.adapter || makeApiAdapter({ orgUrl: a.orgUrl, project: a.project, token: cred.token, fetch: deps.fetch })
      return adapter.readViewer()
    },
    nameOf: displayNameOf,
  })
}

const displayNameOf = defaultDisplayName

module.exports = { resolveIdentity, displayNameOf }
