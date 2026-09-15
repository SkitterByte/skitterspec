'use strict'

/**
 * Register the review-gate hook in the project's Claude Code settings.
 *
 * `.claude/settings.json` rather than `settings.local.json`, and the difference
 * is the point: the trusted-worktree entry is an absolute path and therefore
 * one machine's business, while this is the project's policy — a phase that
 * ended owes a verdict — and it should reach everyone who clones the repo. The
 * command is written with `${CLAUDE_PROJECT_DIR}` so it stays true wherever the
 * checkout lives, worktrees included.
 *
 * Conservative in the same way `trust.js` is: every existing key is preserved,
 * a file it cannot parse is left exactly as it is, and re-running changes
 * nothing once the entry is there. Callers own the reporting.
 */

const fs = require('node:fs')
const path = require('node:path')

const HOOK_SCRIPT = '.claude/hooks/review-gate.js'
const HOOK_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/${HOOK_SCRIPT}"`
// Seconds. The engine call behind this is one git-free read of a small JSON
// file, so anything approaching this is a wedge rather than slow work — and a
// hook that times out fails OPEN, which is the answer we want for a wedge.
const HOOK_TIMEOUT = 10
const MATCHER = 'Bash'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function settingsPath(dir) {
  return path.join(dir, '.claude', 'settings.json')
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n')
}

function hookEntry() {
  return {
    matcher: MATCHER,
    hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: HOOK_TIMEOUT }],
  }
}

/**
 * Is our hook already registered under `PreToolUse`? Pure.
 *
 * Matched on the SCRIPT PATH, not on the whole command string. An operator who
 * added a timeout, wrapped the invocation, or changed the interpreter has
 * registered our hook their way — re-adding a second copy beside theirs would
 * run it twice and look like a bug in the gate.
 */
function alreadyRegistered(preToolUse) {
  if (!Array.isArray(preToolUse)) return false
  return preToolUse.some(
    (group) =>
      isObject(group) &&
      Array.isArray(group.hooks) &&
      group.hooks.some((h) => isObject(h) && typeof h.command === 'string' && h.command.includes(HOOK_SCRIPT)),
  )
}

/**
 * Ensure the review-gate hook is registered in `dir`'s project settings.
 * Idempotent and non-destructive. Returns `{ changed, reason }`:
 *   - `created`   — no settings file; one was written
 *   - `added`     — merged into an existing file
 *   - `present`   — already registered (no write)
 *   - `malformed` — the file exists but is not parseable JSON (left untouched)
 */
function ensureReviewGateHook(dir) {
  const file = settingsPath(dir)

  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      writeSettings(file, { hooks: { PreToolUse: [hookEntry()] } })
      return { changed: true, reason: 'created' }
    }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Never rewrite a settings file we could not read. It is the operator's
    // config and everything else in it would be lost.
    return { changed: false, reason: 'malformed' }
  }
  if (!isObject(parsed)) return { changed: false, reason: 'malformed' }

  const hooks = isObject(parsed.hooks) ? parsed.hooks : {}
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : []
  if (alreadyRegistered(preToolUse)) return { changed: false, reason: 'present' }

  writeSettings(file, {
    ...parsed,
    hooks: { ...hooks, PreToolUse: [...preToolUse, hookEntry()] },
  })
  return { changed: true, reason: 'added' }
}

module.exports = {
  ensureReviewGateHook,
  alreadyRegistered,
  hookEntry,
  settingsPath,
  HOOK_SCRIPT,
  HOOK_COMMAND,
}
