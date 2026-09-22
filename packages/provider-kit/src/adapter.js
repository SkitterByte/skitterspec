'use strict'

/**
 * The transport op-contract check: a provider's API adapter may ADD ops beyond
 * its MCP adapter, but must never be missing one — consumers feature-detect the
 * extras and assume the base set. Run it in the provider's own tests against
 * both adapters, so the two transports cannot drift apart silently.
 */

// The function-valued op names an adapter exposes.
function adapterOps(adapter) {
  return Object.keys(adapter || {})
    .filter((k) => typeof adapter[k] === 'function')
    .sort()
}

// Which of `required` are absent from `adapter` — [] is the passing answer.
function missingOps(required, adapter) {
  const have = new Set(adapterOps(adapter))
  return [].concat(required).filter((op) => !have.has(op))
}

module.exports = { adapterOps, missingOps }
