'use strict'

// What this provider tells the shared engine at start-up. Its own bin calls
// this, and so does the base `skitterspec` bin when it finds this provider
// configured in the project (common src/provider.js). A published superset
// carries its own copy of the engine, so the caller passes in the modules to
// register ON: registering on this package's copy would leave the base bin's
// engine as unregistered as before.

const { CONFIG_FILE, ENV_CONFIG_DEFAULTS } = require('./config.js')

function register({ envConfig, idea }) {
  // The isolation defaults, beneath the project's own env.config.json, so
  // `spec-env stage` claims this provider's snapshot sidecar without a hand
  // edit (see common src/env/config.js, setProviderEnvDefaults).
  envConfig.setProviderEnvDefaults(ENV_CONFIG_DEFAULTS)
  // The config file: present, it is what makes `land.specDocs` default to
  // "branch" (see common src/env/config.js, setProviderConfigFile).
  envConfig.setProviderConfigFile(CONFIG_FILE)
  // Jira does not hold ideas yet, and SAYS so: `skitterspec idea` then uses
  // specs/ideas.md. Registering nothing would read as cannot-tell and refuse
  // every capture (see common src/idea.js, selectStore).
  idea.setProviderIdeaStore({ supports: false })
}

module.exports = { register }
