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
    if (error.code === 'ENOENT') return { slots: {} }
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid registry ${config.registry}: ${error.message}`)
  }
  return { slots: isObject(parsed.slots) ? { ...parsed.slots } : {} }
}

// Persist the registry, creating its parent dir as needed.
function writeRegistry(rootDir, config, registry) {
  const file = registryPath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ slots: registry.slots }, null, 2) + '\n')
}

/**
 * Allocate the lowest free slot index to `name`. Idempotent: if `name` already
 * holds a slot, that slot is returned and the registry is unchanged. Returns a
 * new registry object (does not mutate the input).
 */
function allocateSlot(registry, name) {
  const slots = { ...registry.slots }
  if (Object.prototype.hasOwnProperty.call(slots, name)) {
    return { registry: { slots }, slot: slots[name] }
  }
  const used = new Set(Object.values(slots))
  let slot = 0
  while (used.has(slot)) slot++
  slots[name] = slot
  return { registry: { slots }, slot }
}

/**
 * Free `name`'s slot. Idempotent: freeing an absent spec is a clean no-op.
 * Returns a new registry object (does not mutate the input).
 */
function freeSlot(registry, name) {
  const slots = { ...registry.slots }
  delete slots[name]
  return { slots }
}

// Port block base for a slot.
function portOffset(slot, config) {
  return config.docker.portBase + slot * config.docker.portsPerSpec
}

module.exports = {
  registryPath,
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  portOffset,
}
