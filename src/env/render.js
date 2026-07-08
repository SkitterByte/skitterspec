'use strict'

/**
 * Pure renderers for per-spec isolation artifacts.
 *
 * `renderEnvFile` produces the worktree's `.env` body (the only file the engine
 * writes). `expandOpenCommand` expands the optional, editor/terminal-agnostic
 * `open.command` template. No side effects — unit-testable in isolation.
 */

const { expandTokens } = require('./resolve.js')

// The worktree `.env`: COMPOSE_PROJECT_NAME namespaces the Docker stack and its
// named volumes; PORT_OFFSET shifts the spec's reserved port block.
function renderEnvFile({ projectName, portOffset }) {
  return `COMPOSE_PROJECT_NAME=${projectName}\nPORT_OFFSET=${portOffset}\n`
}

// Expand the opener template with the provided tokens. An empty/whitespace-only
// template means "no auto-open" → returns null.
function expandOpenCommand(template, tokens) {
  if (typeof template !== 'string' || !template.trim()) return null
  return expandTokens(template, tokens)
}

module.exports = { renderEnvFile, expandOpenCommand }
