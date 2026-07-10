'use strict'

/**
 * Trust a per-spec worktree directory with Claude Code.
 *
 * Worktrees live outside the primary checkout (`../{repo}-wt/{slug}`), so Claude
 * Code treats them as untrusted and prompts on every edit until the operator
 * grants access. Registering the shared worktree root in
 * `permissions.additionalDirectories` lifts those prompts for every spec at once.
 *
 * The root is an **absolute** path (relative entries aren't reliable in
 * `additionalDirectories`) and therefore machine-specific, so it belongs in the
 * gitignored `.claude/settings.local.json` — never committed config. This merge
 * is deliberately conservative: it preserves every existing key (notably
 * `permissions.allow`), dedups by exact path, and refuses to clobber a file it
 * can't parse. `fs` is the only side effect; callers own the reporting.
 */

const fs = require('node:fs')
const path = require('node:path')

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Absolute path to the machine-local Claude Code settings for `dir`.
function settingsPath(dir) {
  return path.join(dir, '.claude', 'settings.local.json')
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n')
}

/**
 * Ensure `rootAbs` is listed in `permissions.additionalDirectories` of `dir`'s
 * `.claude/settings.local.json`. Idempotent and non-destructive. Returns
 * `{ changed, reason }` where reason is one of:
 *   - `created`   — the settings file was absent and was created
 *   - `added`     — the root was merged into an existing file
 *   - `present`   — the root was already listed (no write)
 *   - `malformed` — the file exists but isn't parseable JSON (left untouched)
 */
function ensureWorktreeDirTrusted(dir, rootAbs) {
  const file = settingsPath(dir)

  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      writeSettings(file, { permissions: { additionalDirectories: [rootAbs] } })
      return { changed: true, reason: 'created' }
    }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { changed: false, reason: 'malformed' }
  }
  if (!isObject(parsed)) return { changed: false, reason: 'malformed' }

  const permissions = isObject(parsed.permissions) ? parsed.permissions : {}
  const dirs = Array.isArray(permissions.additionalDirectories)
    ? permissions.additionalDirectories
    : []

  if (dirs.includes(rootAbs)) return { changed: false, reason: 'present' }

  writeSettings(file, {
    ...parsed,
    permissions: {
      ...permissions,
      additionalDirectories: [...dirs, rootAbs],
    },
  })
  return { changed: true, reason: 'added' }
}

module.exports = {
  ensureWorktreeDirTrusted,
  settingsPath,
}
