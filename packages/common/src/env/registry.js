'use strict'

/**
 * Slot registry for per-spec isolation — the single source of truth for which
 * spec owns which slot index. It lives at the **primary checkout root** (shared
 * by all worktrees, machine-local, gitignored) at the config-driven `registry`
 * path (default `.spec-env/registry.json`).
 *
 * Slot `n` → a reserved port block: `portOffset = portBase + n * portsPerSpec`.
 *
 * The allocation helpers are pure transforms on a registry object so they can be
 * unit-tested with no filesystem; `readRegistry`/`writeRegistry` are the only IO
 * and are the seam the CLI drives. No `Date.now()`/`Math.random()` — determinism
 * matters (callers pass timestamps when needed).
 */

const fs = require('node:fs')
const path = require('node:path')

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Absolute path to the registry file, resolved against the primary checkout root.
function registryPath(rootDir, config) {
  return path.resolve(rootDir, config.registry)
}

// Read the registry from disk. Missing file → an empty registry (never throws
// on absence). Malformed JSON → a clear Error.
function readRegistry(rootDir, config) {
  const file = registryPath(rootDir, config)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return { slots: {}, specless: {} }
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid registry ${config.registry}: ${error.message}`)
  }
  return {
    slots: isObject(parsed.slots) ? { ...parsed.slots } : {},
    specless: isObject(parsed.specless) ? { ...parsed.specless } : {},
  }
}

// Persist the registry, creating its parent dir as needed.
function writeRegistry(rootDir, config, registry) {
  const file = registryPath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // `specless` is written only when it holds something, so a project that never
  // ran `/no-spec` keeps a registry file byte-identical to the one it had
  // before this key existed.
  const payload = { slots: registry.slots }
  if (registry.specless && Object.keys(registry.specless).length) {
    payload.specless = registry.specless
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n')
}

/**
 * Allocate the lowest free slot index to `name`. Idempotent: if `name` already
 * holds a slot, that slot is returned and the registry is unchanged. Returns a
 * new registry object (does not mutate the input).
 */
function allocateSlot(registry, name) {
  const slots = { ...registry.slots }
  // CARRIED THROUGH, NOT REBUILT. Every one of these helpers returns a whole
  // registry, so a helper that forgets a key silently deletes it on the next
  // write — which is how a `/no-spec` branch would have become unresolvable the
  // moment any Docker spec was provisioned beside it.
  const specless = { ...(registry.specless || {}) }
  if (Object.prototype.hasOwnProperty.call(slots, name)) {
    return { registry: { slots, specless }, slot: slots[name] }
  }
  const used = new Set(Object.values(slots))
  let slot = 0
  while (used.has(slot)) slot++
  slots[name] = slot
  return { registry: { slots, specless }, slot }
}

/**
 * Free `name`'s slot. Idempotent: freeing an absent spec is a clean no-op.
 * Returns a new registry object (does not mutate the input).
 */
function freeSlot(registry, name) {
  const slots = { ...registry.slots }
  delete slots[name]
  return { slots, specless: { ...(registry.specless || {}) } }
}

// Port block base for a slot.
function portOffset(slot, config) {
  return config.docker.portBase + slot * config.docker.portsPerSpec
}

/**
 * Record a SPECLESS branch — `/no-spec` work, which has a worktree and a branch
 * and no spec document anywhere.
 *
 * A SEPARATE KEY RATHER THAN A SLOT, and that is the whole design of it. A slot
 * means a reserved port block, which mechanical work does not want; and every
 * consumer of `slots` reads an entry there as "this spec runs a Docker stack".
 * Sharing the map would have made `/no-spec` allocate ports it never binds and
 * appear as a stateful spec in `status`.
 *
 * It is what makes a specless name RESOLVABLE. Without a record, "no spec folder
 * for this name" is indistinguishable from a typo — and `resolve.js` would have
 * to treat every unknown name as possibly-specless, which is exactly the
 * absence-as-evidence this codebase refuses (`.claude/rules/negative-checks.md`
 * rule 1). This is the positive signal: the engine wrote this name down.
 *
 * Idempotent, and pure — returns a new registry object.
 */
function recordSpecless(registry, name, entry = {}) {
  const specless = { ...(registry.specless || {}) }
  specless[name] = { ...(specless[name] || {}), ...entry }
  return { slots: { ...registry.slots }, specless }
}

/**
 * Forget a specless branch. Idempotent: forgetting an absent one is a clean
 * no-op, which is what lets teardown call it without looking first.
 */
function forgetSpecless(registry, name) {
  const specless = { ...(registry.specless || {}) }
  delete specless[name]
  return { slots: { ...registry.slots }, specless }
}

// Is this name a recorded specless branch? Pure, and the positive signal
// `resolve.js` asks for before it will resolve a name with no spec folder.
function isSpecless(registry, name) {
  return Object.prototype.hasOwnProperty.call((registry && registry.specless) || {}, name)
}

// Every recorded specless name, sorted so output is stable. Pure.
function speclessNames(registry) {
  return Object.keys((registry && registry.specless) || {}).sort()
}

module.exports = {
  registryPath,
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  portOffset,
  recordSpecless,
  forgetSpecless,
  isSpecless,
  speclessNames,
}
