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
  // Linear holds ideas: an issue carrying `intake.ideaLabel`, in no project,
  // so `skitterspec idea` hands Linear the command instead of writing
  // specs/ideas.md (see common src/idea.js, selectStore).
  idea.setProviderIdeaStore({
    supports: true,
    run: (sub, argv, { cwd, out } = {}) => require('./cli-sync.js').specSync(['idea', sub, ...argv], { cwd, out }),
  })
}

module.exports = { register }
