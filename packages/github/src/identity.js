'use strict'

/**
 * "Who am I on GitHub?" — the GitHub binding of the kit's identity resolver
 * (`provider-kit/src/identity.js`: store → viewer → unknown, unknown being a
 * normal state).
 *
 * The answer is DERIVED from the token: a personal access token belongs to a
 * person, so `GET /user` names them. The id is the LOGIN — what an assignee is
 * set by — never the numeric id, which nothing in the CLI accepts.
 */

const { resolveIdentity: kitResolveIdentity, defaultDisplayName } = require('@skitterbyte/skitterspec-provider-kit/src/identity.js')
const { makeApiAdapter } = require('./api.js')
const { storePath, readStore, userForScope, resolveCredential, scopeOf } = require('./credentials.js')

async function resolveIdentity(config, env = process.env, deps = {}) {
  const file = (deps.storePath || storePath)(env)
  return kitResolveIdentity({
    scopeId: scopeOf(config),
    file,
    readStore: (f) => (deps.readStore || readStore)(f),
    userFor: (store, id) => userForScope(store, id),
    // An injected adapter needs no token — the test seam, and nothing else.
    resolveCredential: () => (deps.adapter ? { ok: true } : resolveCredential(config, env)),
    readViewer: (cred) => {
      const g = (config && config.github) || {}
      const adapter =
        deps.adapter || makeApiAdapter({ owner: g.owner, repo: g.repo, project: g.project, token: cred.token, fetch: deps.fetch })
      return adapter.readViewer()
    },
    nameOf: displayNameOf,
  })
}

const displayNameOf = defaultDisplayName

module.exports = { resolveIdentity, displayNameOf }
