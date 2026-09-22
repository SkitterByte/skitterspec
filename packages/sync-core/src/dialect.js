'use strict'

/**
 * The tracker's markdown DIALECT — how a provider shapes outbound text and
 * reduces read-backs for comparison. The engine is provider-neutral, but every
 * tracker reserialises text its own way (one rewrites bullets and mangles
 * emphasis, another stores a different format entirely), so the transforms live
 * with the provider and arrive here on `config.dialect`.
 *
 * Three hooks, each `string → string` and pure:
 *
 *   - `canonicalize(text)`       — canonicalise a projected description so
 *                                  semantically-equal content hashes equal
 *                                  across the boundary.
 *   - `flattenTables(text)`      — rewrite constructs the tracker's renderer is
 *                                  known to corrupt (applied to every projected
 *                                  body).
 *   - `canonicalForCompare(text)`— reduce a read-back so the tracker's own
 *                                  benign reserialisation does not read as data
 *                                  loss (see `verify.js`).
 *
 * The identity dialect is the default: no provider transforms, plus the one
 * reduction that is universal (line endings, trailing whitespace, blank-run
 * collapse) so `canonicalForCompare` is never a bare string equality.
 */

function baseCanonicalForCompare(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const identityDialect = Object.freeze({
  canonicalize: (text) => text,
  flattenTables: (text) => text,
  canonicalForCompare: baseCanonicalForCompare,
})

// The dialect in play for a config: the provider's hooks over the identity
// defaults, so a provider may supply any subset.
function dialectOf(config) {
  const d = config && config.dialect
  if (!d || typeof d !== 'object') return identityDialect
  return { ...identityDialect, ...d }
}

module.exports = { identityDialect, dialectOf, baseCanonicalForCompare }
