'use strict'

// Which tickets a release contains — entirely provider-neutral, so the
// implementation lives in the kit. Re-exported here so the provider's own
// modules and tests keep one import path.
module.exports = require('@skitterbyte/skitterspec-provider-kit/src/released.js')
