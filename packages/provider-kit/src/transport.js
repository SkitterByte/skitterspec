'use strict'

/**
 * Which transport a command runs over: `--via` wins, else the config's
 * declared default, else "api when a credential resolved, mcp when it didn't".
 *
 * This expression was repeated verbatim nine times in the first provider —
 * hoisted so the precedence is decided once. Per-command DEGRADATION stays with
 * the command: which operations are impossible over mcp (exit 1, say so) and
 * which hand the skill instructions (exit 0) is a per-command judgment, not a
 * transport fact.
 */

function resolveTransport(flags, config, credentialOk) {
  return (
    (flags && flags.via) ||
    (config && config.apply && config.apply.transport) ||
    (credentialOk ? 'api' : 'mcp')
  )
}

module.exports = { resolveTransport }
