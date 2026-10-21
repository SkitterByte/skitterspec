'use strict'

/**
 * Provider-neutral CLI plumbing shared by skitterspec ticketing providers.
 *
 * sync-core is the projection/plan/snapshot ENGINE — pure, no CLI, no network.
 * This package is everything a provider\'s CLI builds around that engine and
 * that a second provider would otherwise duplicate: config merging, the
 * namespaced credentials store, identity resolution, the doctor report
 * framework, released-range scanning, transport resolution, rate-limit-aware
 * HTTP retry, spec resolution/listing, terminal secret input, and a flag
 * parser with the unknown-flag refusal. Nothing in here names a tracker.
 */

const config = require('./src/config.js')
const credentials = require('./src/credentials.js')
const identity = require('./src/identity.js')
const doctor = require('./src/doctor.js')
const released = require('./src/released.js')
const transport = require('./src/transport.js')
const http = require('./src/http.js')
const specs = require('./src/specs.js')
const prompt = require('./src/prompt.js')
const args = require('./src/args.js')
const adapter = require('./src/adapter.js')
const apply = require('./src/apply.js')
const releases = require('./src/releases.js')

module.exports = {
  ...config,
  ...credentials,
  ...identity,
  ...doctor,
  ...released,
  ...transport,
  ...http,
  ...specs,
  ...prompt,
  ...args,
  ...adapter,
  ...apply,
  ...releases,
}
