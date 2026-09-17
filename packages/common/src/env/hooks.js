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

// `.cjs`, and the extension is load-bearing. This file is copied INTO the target
// project, where that project's `package.json` decides how node parses a `.js` —
// so the CommonJS script shipped as `review-gate.js` died on its own first
// `require` in every `"type": "module"` project, printing a stack trace over
// every Bash tool call. `.cjs` settles the parse mode at the file, independently
// of the one file skitterspec does not control.
const HOOK_STEM = '.claude/hooks/review-gate'
const HOOK_SCRIPT = `${HOOK_STEM}.cjs`
const HOOK_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/${HOOK_SCRIPT}"`

// Our script under ANY extension, so a registration naming the retired `.js` is
// recognised as ours and migrated rather than duplicated. The trailing lookahead
// is the boundary: without it `review-gate-extra.js` — somebody else's hook —
// matches on the stem and gets silently rewritten.
const HOOK_SCRIPT_RE = /[.]claude[/\\]hooks[/\\]review-gate(?:[.][A-Za-z0-9]+)?(?![\w.-])/
// Seconds. The engine call behind this is one git-free read of a small JSON
// file, so anything approaching this is a wedge rather than slow work — and a
// hook that times out fails OPEN, which is the answer we want for a wedge.
const HOOK_TIMEOUT = 10
const MATCHER = 'Bash'

/**
 * Every hook this package registers, as data.
 *
 * ONE LIST, so a second hook cannot arrive as a second copy of the merge logic
 * below — which is where every property this file has earned would have to be
 * re-derived and one of them forgotten. Each entry supplies only what differs:
 * the script's stem, the tools it matches, and its timeout.
 *
 * The `re` for each is built from its stem with the same boundary lookahead the
 * review gate's has, so `main-guard-extra.js` — somebody else's hook — is not
 * silently rewritten as ours.
 */
function hookStemRe(stem) {
  const name = stem.split('/').pop()
  return new RegExp(`[.]claude[/\\\\]hooks[/\\\\]${name}(?:[.][A-Za-z0-9]+)?(?![\\w.-])`)
}

const HOOKS = [
  {
    key: 'review-gate',
    stem: HOOK_STEM,
    matcher: MATCHER,
    timeout: HOOK_TIMEOUT,
  },
  {
    // Refuses an Edit/Write in the primary checkout while it is on the base
    // branch. A different matcher from the review gate's, because it guards a
    // different moment: the first write, before any work exists.
    key: 'main-guard',
    stem: '.claude/hooks/main-guard',
    matcher: 'Edit|Write|NotebookEdit|MultiEdit',
    timeout: HOOK_TIMEOUT,
  },
].map((h) => ({ ...h, script: `${h.stem}.cjs`, re: hookStemRe(h.stem) }))

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

function commandFor(script) {
  return `node "\${CLAUDE_PROJECT_DIR}/${script}"`
}

function hookEntry(hook = HOOKS[0]) {
  return {
    matcher: hook.matcher,
    hooks: [{ type: 'command', command: commandFor(hook.script), timeout: hook.timeout }],
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
function alreadyRegistered(preToolUse, hook = HOOKS[0]) {
  return registeredHooks(preToolUse, hook).length > 0
}

// Every hook object under `PreToolUse` whose command names our script, whatever
// extension it names it under. Pure.
function registeredHooks(preToolUse, hook = HOOKS[0]) {
  if (!Array.isArray(preToolUse)) return []
  const out = []
  for (const group of preToolUse) {
    if (!isObject(group) || !Array.isArray(group.hooks)) continue
    for (const h of group.hooks) {
      if (isObject(h) && typeof h.command === 'string' && hook.re.test(h.command)) out.push(h)
    }
  }
  return out
}

/**
 * Ensure ONE hook is registered in an already-parsed settings object.
 * Mutates `parsed` in place when it migrates a stale path; returns
 * `{ changed, reason }` with the same vocabulary as the wrapper below.
 *
 * Split out so a second hook could be added without a second copy of this
 * logic — which is where every property this file has earned (preserve unknown
 * keys, match on the script PATH, migrate in place, stay idempotent) would have
 * had to be re-derived, and one of them forgotten.
 */
function ensureOneHook(parsed, hook) {
  const hooks = isObject(parsed.hooks) ? parsed.hooks : {}
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : []

  // Registered already — but possibly under a path that no longer exists, since
  // the script's extension changed. Rewrite the path IN PLACE rather than
  // replacing the command: an operator who wrapped our hook, added a flag or
  // changed the interpreter has registered it their way, and the thing that
  // moved is the file, not their command. Adding a fresh entry beside theirs
  // would run the gate twice and read as a bug in the gate; leaving the old one
  // alone would aim the harness at a file this same upgrade retires.
  const registered = registeredHooks(preToolUse, hook)
  if (registered.length) {
    const stale = registered.filter((h) => !h.command.includes(hook.script))
    if (!stale.length) return { changed: false, reason: 'present' }
    for (const h of stale) h.command = h.command.replace(hook.re, hook.script)
    return { changed: true, reason: 'migrated' }
  }

  parsed.hooks = { ...hooks, PreToolUse: [...preToolUse, hookEntry(hook)] }
  return { changed: true, reason: 'added' }
}

/**
 * Ensure every hook this package ships is registered in `dir`'s project
 * settings. Idempotent and non-destructive. Returns `{ changed, reason }`:
 *   - `created`   — no settings file; one was written
 *   - `added`     — merged into an existing file
 *   - `migrated`  — registered under a retired path; the path was rewritten
 *   - `present`   — already registered (no write)
 *   - `malformed` — the file exists but is not parseable JSON (left untouched)
 *
 * WITH SEVERAL HOOKS THE REASON IS THE STRONGEST ONE that applied, in the order
 * added > migrated > present. A run that added one hook and found the other
 * already there did change the file, and reporting `present` for it would tell
 * an operator nothing happened when something did.
 */
function ensureHooks(dir) {
  const file = settingsPath(dir)

  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      writeSettings(file, { hooks: { PreToolUse: HOOKS.map((h) => hookEntry(h)) } })
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

  const reasons = HOOKS.map((h) => ensureOneHook(parsed, h))
  const changed = reasons.some((r) => r.changed)
  if (changed) writeSettings(file, parsed)

  for (const rank of ['added', 'migrated', 'present']) {
    if (reasons.some((r) => r.reason === rank)) return { changed, reason: rank }
  }
  return { changed, reason: 'present' }
}

// The name this shipped under when there was one hook. Kept as an alias rather
// than renamed away, because it is what an installed `init.js` from an older
// version calls — and a rename that breaks an upgrade path is not a rename, it
// is a removal.
const ensureReviewGateHook = ensureHooks

module.exports = {
  ensureHooks,
  ensureReviewGateHook,
  alreadyRegistered,
  registeredHooks,
  hookEntry,
  settingsPath,
  HOOKS,
  HOOK_STEM,
  HOOK_SCRIPT,
  HOOK_SCRIPT_RE,
  HOOK_COMMAND,
}
