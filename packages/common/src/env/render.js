'use strict'

/**
 * Pure renderers for per-spec isolation artifacts.
 *
 * `renderEnvFile` produces the worktree's `.env` body — the only file the engine
 * writes. No side effects — unit-testable in isolation.
 */

// The worktree `.env`: COMPOSE_PROJECT_NAME namespaces the Docker stack and its
// named volumes; PORT_OFFSET shifts the spec's reserved port block.
function renderEnvFile({ projectName, portOffset }) {
  return `COMPOSE_PROJECT_NAME=${projectName}\nPORT_OFFSET=${portOffset}\n`
}


module.exports = { renderEnvFile }
