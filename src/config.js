'use strict'

/**
 * Config helpers for the skitterspec CLI.
 *
 * The implementation lives in `assets/scripts/lib/config.js` — the same file
 * that ships into a consumer's `scripts/lib/`, so the loader has one source of
 * truth and the consumer's copied scripts never depend back into this package.
 * This module just re-exports it for use by the CLI (`init`, the install
 * prompts in Phase 3).
 */

module.exports = require('../assets/scripts/lib/config.js')
