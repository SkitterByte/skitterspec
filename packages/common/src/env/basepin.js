'use strict'

/**
 * The gap pin: a local record that someone accepted "use <fallback> as the base
 * for now" while `baseBranchPattern` matched nothing — the gap between one
 * release branch merging and the next being cut.
 *
 * It lives in `.spec-env/base-pin.json` in the primary checkout, gitignored, so
 * accepting the offer changes nobody else's config. It records the pattern it
 * was made under, and the resolver honours it only while that pattern has no
 * match (`describeBaseBranch`), so cutting the next release branch is all it
 * takes to retire it. Callers that see a match override it delete the file.
 *
 * Pure file I/O, no git: the resolver decides what a pin means.
 */

const fs = require('node:fs')
const path = require('node:path')

// The state dir sits beside the registry file, e.g. `.spec-env` — the same
// convention `building.js` and `dev.js` use.
function pinPath(dir, config) {
  const stateDir = path.posix.dirname((config && config.registry) || '.spec-env/registry.json') || '.spec-env'
  return path.join(dir, stateDir, 'base-pin.json')
}

/**
 * The pin as `{ base, pattern, pinnedAt }`, or null. An unreadable or malformed
 * file is no pin: the resolver then refuses and offers again, which is the
 * harmless direction — a pin read wrongly would decide a base nobody chose.
 */
function readBasePin(dir, config) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(pinPath(dir, config), 'utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed.base !== 'string' || typeof parsed.pattern !== 'string') return null
  if (!parsed.base.trim() || !parsed.pattern.trim()) return null
  return { base: parsed.base, pattern: parsed.pattern, pinnedAt: typeof parsed.pinnedAt === 'string' ? parsed.pinnedAt : null }
}

function writeBasePin(dir, config, { base, pattern, pinnedAt = new Date().toISOString() }) {
  const file = pinPath(dir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const pin = { base, pattern, pinnedAt }
  fs.writeFileSync(file, JSON.stringify(pin, null, 2) + '\n')
  return pin
}

/** Remove the pin. True when there was one to remove. */
function clearBasePin(dir, config) {
  try {
    fs.unlinkSync(pinPath(dir, config))
    return true
  } catch {
    return false
  }
}

module.exports = { pinPath, readBasePin, writeBasePin, clearBasePin }
