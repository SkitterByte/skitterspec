'use strict'

/**
 * Translate normalized field values into a local frontmatter patch (pull side).
 *
 * Only the `pull`-owned, frontmatter-backed fields have a local home in Phase 2:
 *   workflowState → spec_status (Linear state name mapped back to the bucket),
 *   priority      → priority,
 *   labels        → labels.
 * Any other field handed in (a body field like `description`/`milestones`) has no
 * frontmatter mapping yet, so it's returned in `deferred` — the caller must NOT
 * advance its base, keeping the remote edit pending instead of falsely synced.
 */

// field name → frontmatter key.
const FRONTMATTER_FIELD = {
  workflowState: 'spec_status',
  priority: 'priority',
  labels: 'labels',
}

// Invert config.states ({ bucket: "Linear Name" }) → { "linear name": bucket }.
function invertStates(config) {
  const out = {}
  const states = (config && config.states) || {}
  for (const [bucket, name] of Object.entries(states)) {
    if (typeof name === 'string') out[name.toLowerCase()] = bucket
  }
  return out
}

// Map a remote workflowState (a Linear state name) back to a local bucket. Falls
// back to the raw value when it isn't one of the configured states.
function localWorkflowState(value, config) {
  if (value == null) return null
  const bucket = invertStates(config)[String(value).toLowerCase()]
  return bucket || String(value)
}

/**
 * Build the frontmatter patch for a set of applied field values.
 * @param {object} fieldValues  { fieldName: value } to write locally
 * @returns {{ patch:object, applied:string[], deferred:string[] }}
 */
function frontmatterPatchFor(fieldValues, config) {
  const patch = {}
  const applied = []
  const deferred = []
  for (const [field, value] of Object.entries(fieldValues)) {
    const key = FRONTMATTER_FIELD[field]
    if (!key) {
      deferred.push(field)
      continue
    }
    patch[key] = field === 'workflowState' ? localWorkflowState(value, config) : value
    applied.push(field)
  }
  return { patch, applied, deferred }
}

module.exports = {
  frontmatterPatchFor,
  localWorkflowState,
  invertStates,
  FRONTMATTER_FIELD,
}
