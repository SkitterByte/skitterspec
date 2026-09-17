'use strict'

/**
 * Config loader for the per-spec isolation feature (`/spec-env`).
 *
 * Reads `specs/.core/env.config.json` from the project root and normalises it
 * over frozen defaults. The feature is strictly opt-in: when the file is absent
 * the loader never throws — it returns the defaults with `present:false`, which
 * every caller treats as "feature unused".
 *
 * Mirrors the shape/idiom of `assets/scripts/lib/config.js` (frozen defaults,
 * merge known keys only, forward-compatible on unknown keys). Zero-dependency.
 *
 * Shape (see specs/.core/env.config.md for field docs):
 *   {
 *     mode:     "worktree" | "checkout",  // where a spec's branch is built —
 *               // its own worktree (default), or the primary checkout in place.
 *               // NOTE: unrelated to `seedFiles.mode`, which is symlink|copy.
 *     worktree: { root, folderPattern },
 *     docker:   { enabled, composeFile, projectNamePattern, portBase,
 *                 portsPerSpec, envFile, backupCommand },
 *     seedFiles:{ mode, files } | [ ".env", ... ],  // gitignored files copied/
 *               // symlinked from the main checkout into a fresh worktree before
 *               // setup runs (mode: "symlink" default | "copy"); empty = none
 *     setup:    [ "cmd", ... ],  // bootstrap commands run in the worktree right
 *               // after `git worktree add` (e.g. install deps); empty = none
 *     dev:      [ { name, command, portVar, health?, frontPort? } ],  // host dev
 *               // servers started on the spec's port block (empty = none)
 *     proxy:    { enabled, host },  // bundled front-door proxy (spec-env connect)
 *     registry: ".spec-env/registry.json",
 *     branch:   { pattern, identifierField },  // git branch naming (provider-neutral)
 *     spec:     { companionPaths: [ "path", ... ] },  // paths that belong to a
 *               // spec alongside its own folder (provider-neutral; {slug} and
 *               // {identifier} expand); empty = the spec folder only
 *     baseBranch: "",          // "" = auto-detect (origin/HEAD → main → master)
 *     guards:   { refuseTeardownIfDirty, refuseTeardownIfUnpushed },
 *     teardown: { deleteRemoteBranch },
 *     live:     { migrations: [ "glob", ... ] }  // migration globs → `live take`
 *               // refuses a branch that changes them (code-only v1)
 *     hotfix:   { bump, cherryPickMain, targets }  // `hotfix land`: patch-bump the
 *               // deploy tag, also cherry-pick onto the base branch (main), and
 *               // onto any extra base tags in `targets` (test/demo lines)
 *   }
 */

const { createHash } = require('node:crypto')
const { readFileSync, realpathSync } = require('node:fs')
const { join, resolve } = require('node:path')

const CONFIG_FILE = join('specs', '.core', 'env.config.json')

// The window `servePort: "auto"` derives a port from. 7700-7799 keeps the
// familiar neighbourhood — 7777, the old shared default, is inside it — while
// giving every repo on a machine its own slot without anyone configuring one.
//
// A hundred slots is a SMALL chance of two repos landing together, not no
// chance. That case is not papered over: the server still refuses the busy
// port and names `servePort` as the durable fix. Walking up to the next free
// port would remove the refusal and keep the staleness, because the port would
// then depend on which repo started first.
const PORT_BASE = 7700
const PORT_SPAN = 100

/**
 * The repo path the derivation hashes — `realpath`ed ONCE, here.
 *
 * A symlinked spelling of one tree (`/tmp` → `/private/tmp` on macOS, a
 * convenience symlink into a worktree root) is the same repo, and hashing the
 * two spellings separately would hand out two different ports for it — two
 * different URLs, one of them dead. Resolving once is what makes the port a
 * property of the tree rather than of how you typed it.
 *
 * WHAT WOULD FOOL THIS: `realpathSync` throws on a path that does not exist, so
 * it falls back to `resolve`. That is the cannot-tell branch and it is routed
 * to inaction (.claude/rules/negative-checks.md rule 4) — an absolute path is
 * still deterministic, so the worst case is a stable port for a directory that
 * is not there, never a crash on an unrelated command.
 */
function servePortRoot(dir) {
  try {
    return realpathSync(resolve(dir))
  } catch {
    return resolve(dir)
  }
}

/**
 * `PORT_BASE + hash(path) % PORT_SPAN` — a PURE function of the path.
 *
 * Purity is the whole point, not an implementation detail. A port that is
 * merely *free* is not a port a link handed out yesterday can still resolve, so
 * nothing here may read the registry, `.spec-env/`, or any other state on disk:
 * a port that depends on a file changes when the file is deleted, and this
 * exists precisely so it does not change. The same tree gets the same port
 * across a restart, a reboot, and a `--stop`.
 *
 * sha256 rather than a hand-rolled hash because its distribution is not
 * something this file has to argue for — with a hundred slots, clustering is
 * the only way the derivation could fail at its job.
 */
function derivedServePort(root) {
  const digest = createHash('sha256').update(root).digest()
  return PORT_BASE + (digest.readUInt32BE(0) % PORT_SPAN)
}

/**
 * The port `spec-env review serve` should use, and HOW it was chosen.
 *
 * Three sources, in precedence order: `--port` on this run, an explicit number
 * in `review.servePort`, else the derivation. The `source` rides along so
 * `--status` can answer "why is this on 7742?" from the tool rather than from
 * reading this file.
 *
 * Returns `{ port, source, root? }`; `root` is the resolved path that was
 * hashed, present only on a derived port.
 */
function resolveServePort(config, dir, override) {
  const flag = Number(override)
  if (override != null && override !== '' && Number.isFinite(flag)) {
    return { port: flag, source: 'flag' }
  }
  const configured = config && config.review ? config.review.servePort : undefined
  if (typeof configured === 'number' && Number.isFinite(configured)) {
    return { port: configured, source: 'configured' }
  }
  const root = servePortRoot(dir)
  return { port: derivedServePort(root), source: 'derived', root }
}

/** One sentence naming how a resolved port was chosen, for `--status`. */
function servePortReason(source) {
  if (source === 'flag') return 'this run only, from --port'
  if (source === 'configured') return 'pinned by review.servePort'
  if (source === 'derived') return "derived from this repo's path"
  return ''
}

const DEFAULT_CONFIG = Object.freeze({
  // Where a spec's branch is built. "worktree" gives every spec its own checkout
  // — parallel specs, `main` left free — at the cost of a terminal session per
  // spec. "checkout" builds the branch in the primary checkout instead: one spec
  // at a time, in the terminal you are already sitting in.
  //
  // Defaults to "worktree" so no installed repo changes behaviour on upgrade.
  // Never inferred from whether `dev`/`docker` are configured: a repo with no
  // dev servers may still want parallel specs, and absence of configuration is
  // not evidence of intent (see .claude/rules/negative-checks.md).
  mode: 'worktree',
  worktree: Object.freeze({ root: '../{repo}-wt', folderPattern: '{slug}' }),
  docker: Object.freeze({
    enabled: true,
    composeFile: 'docker-compose.yml',
    projectNamePattern: '{repoSlug}_{slug}',
    portBase: 3000,
    portsPerSpec: 10,
    envFile: '.env',
    backupCommand: '',
  }),
  // Gitignored files seeded from the main checkout into a fresh worktree by
  // `spec-env up`, right after `git worktree add` and before `setup` runs — so a
  // fresh worktree has the .env / local overrides that setup steps depend on.
  // `mode` is "symlink" (default, stays in sync with main) or "copy" (an
  // independent copy). `files` is a list of repo-relative paths. Default: none.
  seedFiles: Object.freeze({ mode: 'symlink', files: Object.freeze([]) }),
  // Bootstrap commands run in the worktree by `spec-env up`, right after
  // `git worktree add` (before Docker/dev), on every provision. Array of shell
  // strings (e.g. "pnpm install"); {slug}/{branch}/… expand. Default: none.
  setup: Object.freeze([]),
  // Host dev servers started on the spec's port block by `spec-env dev up`.
  // Each: { name, command, portVar, health?, frontPort? }. Default: none.
  dev: Object.freeze([]),
  // Front-door proxy (`spec-env connect`): a bundled Node reverse proxy that
  // exposes one connected spec's frontPort processes on the canonical ports.
  proxy: Object.freeze({ enabled: true, host: '127.0.0.1' }),
  registry: '.spec-env/registry.json',
  // Git branch naming, provider-neutral. `pattern` expands {type}/{slug} and,
  // when a tracker provider is linked, {identifier}; `identifierField` names the
  // 00-overview.md frontmatter field a provider writes the ticket id into (empty
  // = no identifier, so patterns referencing {identifier} fall back to type/slug).
  branch: Object.freeze({ pattern: '{type}/{slug}', identifierField: '' }),
  // Paths that belong to a spec ALONGSIDE its own `specs/<bucket>/<name>/` folder
  // — a tracker provider's per-spec snapshot, for instance. Provider-neutral by
  // design: the base engine must not know that any particular tracker exists, so
  // the project declares the shape and `{slug}` / `{identifier}` expand exactly as
  // they do in `branch.pattern` ({identifier} via `branch.identifierField`).
  // Default: none, so a spec owns only its own folder.
  spec: Object.freeze({ companionPaths: Object.freeze([]) }),
  // Integration base branch. Empty = auto-detect (origin/HEAD → main → master).
  baseBranch: '',
  // `mainIsLandingZone` defaults ON wherever isolation is configured, matching
  // the review gate's precedent: the push toward not working on the base branch
  // is the normal path, and stepping off it is the deliberate act. That does
  // change behaviour for a project on upgrade, which is the honest cost — the
  // refusal names both exits (`/no-spec` and `/allow-main`) and this key.
  guards: Object.freeze({
    refuseTeardownIfDirty: true,
    refuseTeardownIfUnpushed: true,
    mainIsLandingZone: true,
  }),
  // Teardown cleanup beyond this machine. `deleteRemoteBranch` decides what
  // `spec-env down` does about a branch the USER published by hand — nothing
  // publishes one at provisioning, so there is often no remote ref at all and
  // the plan then says nothing: "prompt" (default)
  // plans the delete in its own confirm-first section for the skill to ask about,
  // "never" omits it, "always" folds it into the run-blind command list. Only ever
  // planned for a LANDED branch — see teardown.js.
  teardown: Object.freeze({ deleteRemoteBranch: 'prompt' }),

  // `reader` decides how a diff's location is WORDED, and nothing else. It
  // once also decided whether the engine served — a gate that produced the
  // `file://` link on a local machine, where a `file://` page cannot POST and
  // so the verdict buttons had nowhere to go. `serve` owns that now.
  // It never decides to PUBLISH: publishing
  // leaves a page this tooling cannot remove, so it stays an explicit ask.
  // `detect` sniffs; `local`/`remote` are the operator's own answer and are
  // believed without sniffing, because they know where they are reading and no
  // signal can outrank that.
  // `commitWith` names the skill a COMMITTING verdict hands off to. `/commit`
  // ships with skittership, a different package — so it may not be installed,
  // and skitterspec must never vendor a copy of it.
  //
  // There is no off switch, and that is deliberate: `"none"` existed and was
  // removed, because it produced the one thing a review page must not have —
  // a verdict that records itself and does nothing. A review is the guard in
  // front of an action; recording an approval for SOMEONE ELSE to act on is a
  // different mechanism, not a value of this key.
  //
  // `required` decides whether a phase that ended owes a verdict before its
  // work can be committed or the next phase built. It defaults TRUE: the push
  // toward reading the diff is the point, and a project that would rather not
  // be pushed says so once. It is the only key anything reads to decide
  // whether the gate refuses, so turning it off turns off the hook with it.
  // `serve` decides whether a render stands the local server up: `always`
  // (the default) or `never`. It replaced `serveOnRemote`, whose name would now
  // claim to govern remote renders while governing every one of them — and a
  // config key that lies is what made a wrong fix look right. A legacy
  // `serveOnRemote: false` is still read as `serve: "never"`.
  //
  // THE BIND IS NOT THIS KEY'S BUSINESS, and that separation is what keeps
  // serving-everywhere free of new exposure: `reader` still decides it, so a
  // remote reader binds every interface exactly as before and a local or
  // unknown one binds loopback. Serving more never means listening wider.
  // `allowNetwork` and `allowRemote` are the two tiers a project permits. They
  // exist because the engine CANNOT KNOW where the reader is sitting and kept
  // being asked to guess: detection reported `unknown` on a local session and
  // produced a page whose buttons cannot POST, reported `remote` and produced a
  // LAN URL a phone off the network could not reach, and flipped mid-session
  // and changed the address underneath a reader. Each was fixed on its own; the
  // next reader position would have produced a fourth.
  //
  // So the reader picks instead. `allowNetwork` decides THE BIND — on binds
  // every interface, off binds loopback — which is the last decision detection
  // had. `allowRemote` PERMITS publishing; it never publishes, because each
  // publish leaves a page skitterspec cannot delete.
  review: Object.freeze({
    reader: 'detect',
    servePort: 'auto',
    serve: 'always',
    allowNetwork: true,
    allowRemote: false,
    commitWith: '/commit',
    required: true,
    // External code reviewers whose findings render as CHECKS on the page.
    // Empty by default and never written by `init`: configuring one sends the
    // worktree's diff to whatever the command talks to, which is a decision
    // only the project can make. Two entry shapes — `{use}` names a bundled
    // adapter, `{name, command, format}` is bring-your-own.
    reviewers: Object.freeze([]),
  }),
  // Live overlay (`spec-env live`). `migrations` is a list of globs marking
  // migration files; a branch that changes any of them is treated as stateful and
  // `live take` refuses it (code-only v1). Default: none (nothing is stateful).
  live: Object.freeze({ migrations: Object.freeze([]) }),
  // Hotfix landing (`spec-env hotfix land`). `bump` is the version-bump strategy
  // for the new deploy tag (only "patch" today). `cherryPickMain` also cherry-picks
  // the fix onto the base branch for the next release (default true). `targets` is
  // an optional default list of extra base tags to also patch (test/demo lines);
  // `--also <tag>` on the command adds more at run time. Default: patch, main, none.
  hotfix: Object.freeze({ bump: 'patch', cherryPickMain: true, targets: Object.freeze([]) }),
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * List the keys in a parsed config that `mergeConfig` will not read, as dotted
 * paths (`open`, `review.readr`). Advisory only — nothing here refuses, and the
 * merge below is unchanged: unknown keys are still dropped, they are just no
 * longer dropped in silence.
 *
 * The known set is DEFAULT_CONFIG itself rather than a list written out beside
 * it. That is not a shortcut: every key `mergeConfig` reads is necessarily a key
 * of the defaults, because a key with no default has nothing to merge onto — so
 * a hand-written list would be a second copy of the same contract, and a second
 * copy is how the two come to disagree. Adding a key to `mergeConfig` without
 * adding its default is already impossible; this check inherits that.
 *
 * It descends only where the DEFAULT is a plain object. An array's elements are
 * data, not keys — `dev` entries, `setup` commands, `spec.companionPaths`,
 * `live.migrations`, `hotfix.targets` — and walking into them would report every
 * path in the list as an unknown key.
 *
 * WHAT IT DELIBERATELY DOES NOT REPORT: a KNOWN key whose value was rejected for
 * its type or for not matching an enum (`mode: "Checkout"`,
 * `teardown.deleteRemoteBranch: "yes"`). Those already fall through to a
 * documented conservative default, each with a comment saying why, and folding
 * them in here would change what this line means from "I ignored a key you wrote"
 * to "I disagreed with a value you wrote".
 */
function collectUnknownKeys(parsed, known = DEFAULT_CONFIG, prefix = '') {
  if (!isObject(parsed)) return []
  const out = []
  for (const key of Object.keys(parsed)) {
    const dotted = prefix ? `${prefix}.${key}` : key
    if (!Object.prototype.hasOwnProperty.call(known, key)) {
      out.push(dotted)
      continue
    }
    if (isObject(known[key]) && isObject(parsed[key])) {
      out.push(...collectUnknownKeys(parsed[key], known[key], dotted))
    }
  }
  return out
}

// A fresh, deeply-mutable copy of the defaults to merge onto.
function defaults() {
  return {
    mode: DEFAULT_CONFIG.mode,
    worktree: { ...DEFAULT_CONFIG.worktree },
    docker: { ...DEFAULT_CONFIG.docker },
    seedFiles: { mode: DEFAULT_CONFIG.seedFiles.mode, files: [] },
    setup: [],
    dev: [],
    proxy: { ...DEFAULT_CONFIG.proxy },
    registry: DEFAULT_CONFIG.registry,
    branch: { ...DEFAULT_CONFIG.branch },
    spec: { companionPaths: [] },
    baseBranch: DEFAULT_CONFIG.baseBranch,
    guards: { ...DEFAULT_CONFIG.guards },
    teardown: { ...DEFAULT_CONFIG.teardown },
    review: { ...DEFAULT_CONFIG.review, reviewers: [] },
    live: { migrations: [] },
    hotfix: { ...DEFAULT_CONFIG.hotfix, targets: [] },
  }
}

// Copy a typed field from parsed[key] onto base[key] when it matches `type`.
// Strings are trimmed and must be non-empty to override.
function assign(base, parsed, key, type) {
  const v = parsed[key]
  if (type === 'string') {
    if (typeof v === 'string' && v.trim()) base[key] = v.trim()
  } else if (type === 'string?') {
    // string that may be intentionally empty (e.g. backupCommand)
    if (typeof v === 'string') base[key] = v
  } else if (type === 'boolean') {
    if (typeof v === 'boolean') base[key] = v
  } else if (type === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) base[key] = v
  }
}

/**
 * Normalise a parsed `dev` array into well-formed process entries. Each entry
 * needs non-empty string `name`, `command`, and `portVar`; `health` (string) and
 * `frontPort` (finite number) are optional. Malformed entries are dropped
 * (lenient, like the rest of the loader) so a stray entry can't crash provisioning.
 */
function normalizeDev(parsed) {
  const out = []
  for (const raw of parsed) {
    if (!isObject(raw)) continue
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const command = typeof raw.command === 'string' ? raw.command.trim() : ''
    const portVar = typeof raw.portVar === 'string' ? raw.portVar.trim() : ''
    if (!name || !command || !portVar) continue
    const entry = { name, command, portVar }
    if (typeof raw.health === 'string' && raw.health.trim()) entry.health = raw.health.trim()
    if (typeof raw.frontPort === 'number' && Number.isFinite(raw.frontPort)) {
      entry.frontPort = raw.frontPort
    }
    out.push(entry)
  }
  return out
}

// Keep only trimmed, non-empty strings from an array of file paths (lenient).
function normalizeFileList(parsed) {
  const out = []
  for (const raw of parsed) {
    if (typeof raw !== 'string') continue
    const file = raw.trim()
    if (file) out.push(file)
  }
  return out
}

// How long a reviewer gets before it is killed, in seconds. A generous default:
// these tools take 30s-3min, and the render they precede is about to wait on a
// human for far longer.
const DEFAULT_REVIEWER_TIMEOUT = 180

// Output formats the runner can parse. `rdjsonl` is the native contract
// (reviewdog's interchange shape); a bundled adapter brings its own parser and
// declares no format at all.
const REVIEWER_FORMATS = ['rdjsonl']

/**
 * Read one `review.reviewers` entry. Returns the normalised entry, or `null`
 * with a reason — the caller decides whether to keep it or report it.
 *
 * Two shapes, and they are told apart by which key is present rather than by
 * guessing: `{use}` names a bundled adapter (the engine owns its command line
 * and its parser), `{name, command}` is bring-your-own. An entry carrying both
 * is refused BY NAME rather than resolved in some order — it is two
 * instructions, and picking one would run a reviewer the author did not ask for.
 *
 * WHETHER A NAMED ADAPTER EXISTS IS NOT CHECKED HERE, deliberately: the adapter
 * registry lives in the runner, and this module must not depend on it to answer
 * a question about shape. The runner reports an unknown `use` as its own
 * outcome.
 */
function readReviewer(raw) {
  if (!isObject(raw)) return { entry: null, reason: 'not an object' }
  const use = typeof raw.use === 'string' ? raw.use.trim() : ''
  const command = typeof raw.command === 'string' ? raw.command.trim() : ''
  if (use && command) return { entry: null, reason: 'carries both use and command — write one' }
  // A number that is not finite and positive is not a timeout. Falling through
  // to the default is safe in a way `0` would not be: a zero timeout kills every
  // reviewer instantly and would read, on the page, as one that never ran.
  const t = raw.timeout
  const timeout = typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : DEFAULT_REVIEWER_TIMEOUT
  if (use) {
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : use
    return { entry: { name, use, command: null, format: null, timeout }, reason: null }
  }
  if (!command) return { entry: null, reason: 'has neither use nor command' }
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : ''
  if (!name) return { entry: null, reason: 'has a command but no name' }
  // An unrecognised format is refused rather than defaulted to `rdjsonl`. The
  // scalars above can fall through because their default is what the author
  // most likely meant; here it is not — parsing one tool's output as another's
  // shape yields zero findings and reports the reviewer as clean, which is the
  // false clean this whole feature is built to avoid.
  const fmt = raw.format === undefined || raw.format === null ? 'rdjsonl' : raw.format
  if (!REVIEWER_FORMATS.includes(fmt)) {
    return { entry: null, reason: `format ${JSON.stringify(raw.format)} is not one of ${REVIEWER_FORMATS.join(', ')}` }
  }
  return { entry: { name, use: null, command, format: fmt, timeout }, reason: null }
}

function normalizeReviewers(parsed) {
  const out = []
  for (const raw of parsed) {
    const { entry } = readReviewer(raw)
    if (entry) out.push(entry)
  }
  return out
}

/**
 * List the `review.reviewers` entries the merge dropped, as
 * `{ index, reason }`. Advisory, like `collectUnknownKeys` — nothing refuses.
 *
 * It exists because `collectUnknownKeys` structurally cannot cover this: it
 * descends only where the DEFAULT is a plain object, and this default is an
 * array. Without this, a reviewer entry with a typo in it is dropped in exactly
 * the silence that check was added to end — and worse than an ignored key,
 * because the page would then show no line for it at all.
 */
function collectBadReviewers(parsed) {
  if (!isObject(parsed) || !isObject(parsed.review) || !Array.isArray(parsed.review.reviewers)) return []
  const out = []
  parsed.review.reviewers.forEach((raw, index) => {
    const { entry, reason } = readReviewer(raw)
    if (!entry) out.push({ index, reason })
  })
  return out
}

/**
 * Normalise a parsed `seedFiles` value into `{ mode, files }`. Accepts two forms:
 *   - the array shorthand `[".env", ...]` → { mode: 'symlink', files: [...] }
 *   - the object form `{ mode?, files? }` — `mode` is 'copy' or 'symlink'
 *     (anything else falls back to 'symlink'); `files` is a list of paths.
 * Malformed entries are dropped (lenient, like `normalizeSetup`) so a stray
 * value can't crash provisioning.
 */
function normalizeSeedFiles(parsed) {
  if (Array.isArray(parsed)) {
    return { mode: 'symlink', files: normalizeFileList(parsed) }
  }
  const mode = parsed.mode === 'copy' ? 'copy' : 'symlink'
  const files = Array.isArray(parsed.files) ? normalizeFileList(parsed.files) : []
  return { mode, files }
}

/**
 * Normalise a parsed `setup` array into bootstrap commands: keep only trimmed,
 * non-empty strings, drop everything else (lenient, like `normalizeDev`) so a
 * stray entry can't crash provisioning.
 */
function normalizeSetup(parsed) {
  const out = []
  for (const raw of parsed) {
    if (typeof raw !== 'string') continue
    const cmd = raw.trim()
    if (cmd) out.push(cmd)
  }
  return out
}

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys ignored for forward-compat). Nested objects are merged field-by-field.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (isObject(parsed.worktree)) {
    assign(base.worktree, parsed.worktree, 'root', 'string')
    assign(base.worktree, parsed.worktree, 'folderPattern', 'string')
  }

  if (isObject(parsed.docker)) {
    assign(base.docker, parsed.docker, 'enabled', 'boolean')
    assign(base.docker, parsed.docker, 'composeFile', 'string')
    assign(base.docker, parsed.docker, 'projectNamePattern', 'string')
    assign(base.docker, parsed.docker, 'portBase', 'number')
    assign(base.docker, parsed.docker, 'portsPerSpec', 'number')
    assign(base.docker, parsed.docker, 'envFile', 'string')
    assign(base.docker, parsed.docker, 'backupCommand', 'string?')
  }

  if (Array.isArray(parsed.seedFiles) || isObject(parsed.seedFiles)) {
    base.seedFiles = normalizeSeedFiles(parsed.seedFiles)
  }

  if (Array.isArray(parsed.setup)) {
    base.setup = normalizeSetup(parsed.setup)
  }

  if (Array.isArray(parsed.dev)) {
    base.dev = normalizeDev(parsed.dev)
  }

  if (isObject(parsed.proxy)) {
    assign(base.proxy, parsed.proxy, 'enabled', 'boolean')
    assign(base.proxy, parsed.proxy, 'host', 'string')
  }

  if (isObject(parsed.branch)) {
    assign(base.branch, parsed.branch, 'pattern', 'string')
    assign(base.branch, parsed.branch, 'identifierField', 'string')
  }

  assign(base, parsed, 'registry', 'string')
  assign(base, parsed, 'baseBranch', 'string')

  // Same treatment as `teardown.deleteRemoteBranch` below, for the same reason:
  // an unrecognised value falls through to the default rather than erroring or
  // being taken literally. The fallback direction matters — "worktree" is the
  // conservative one, so a typo ("Checkout", "in-place") costs an extra terminal
  // session, never a spec's work landing somewhere the author did not choose.
  if (parsed.mode === 'worktree' || parsed.mode === 'checkout') {
    base.mode = parsed.mode
  }

  if (isObject(parsed.guards)) {
    assign(base.guards, parsed.guards, 'refuseTeardownIfDirty', 'boolean')
    assign(base.guards, parsed.guards, 'refuseTeardownIfUnpushed', 'boolean')
    assign(base.guards, parsed.guards, 'mainIsLandingZone', 'boolean')
  }

  // An unrecognised policy falls through to the default rather than erroring or
  // being taken literally — a typo ("Always", "yes") must not silently become a
  // stronger setting than the author typed, and "prompt" is the one value that
  // cannot act without a human first.
  if (isObject(parsed.teardown)) {
    const policy = parsed.teardown.deleteRemoteBranch
    if (policy === 'prompt' || policy === 'never' || policy === 'always') {
      base.teardown.deleteRemoteBranch = policy
    }
  }

  // An unrecognised reader falls through to `detect`, which is the state that
  // claims least: it can answer "unknown", and unknown is wired to today's
  // behaviour. A typo must never become a confident `local`, because a confident
  // `local` is exactly the dead `file://` link this key exists to prevent.
  if (isObject(parsed.review)) {
    const reader = parsed.review.reader
    if (reader === 'local' || reader === 'remote' || reader === 'detect') {
      base.review.reader = reader
    }
    // Two accepted forms: a finite number pins the port, and the string "auto"
    // derives it from the repo's path. Anything else is refused BY NAME — the
    // default stands — exactly as `reader`, `mode` and `deleteRemoteBranch`
    // refuse a value they do not recognise.
    //
    // Falling through costs nothing here, and that is worth stating rather than
    // assuming: the only value a typo can fall through to is "auto", which is
    // also the only string that would have been accepted. So a misspelt "auto"
    // behaves identically to the spelling that was meant, and a misspelt number
    // was never a number. There is no reading of this key where silence hides a
    // port the author pinned.
    if (typeof parsed.review.servePort === 'number' && Number.isFinite(parsed.review.servePort)) {
      base.review.servePort = parsed.review.servePort
    } else if (parsed.review.servePort === 'auto') {
      base.review.servePort = 'auto'
    }
    // `always` | `never`; anything else leaves the default standing, so a typo
    // cannot quietly restore the dead `file://` link this key exists to end.
    if (parsed.review.serve === 'always' || parsed.review.serve === 'never') {
      base.review.serve = parsed.review.serve
    }
    // TOLERANCE, NOT MIGRATION — the same rule `readVerdict` follows for the
    // old `approve` spelling. These configs are committed, so a rename with no
    // tolerance breaks every other checkout on the next pull. Only `false` is
    // read: `serveOnRemote: true` said "serve where it matters", which is what
    // `always` now does anyway, so it needs no translation.
    //
    // An explicit `serve` wins, so a config carrying both is read the way its
    // author most recently meant.
    if (parsed.review.serve === undefined && parsed.review.serveOnRemote === false) {
      base.review.serve = 'never'
    }
    // An empty string leaves `/commit` standing, like every other string key
    // here. There is nothing it could mean instead: the hand-off has no off
    // switch, so a blank value is a typo rather than an instruction.
    assign(base.review, parsed.review, 'commitWith', 'string')
    // Same shape as `serveOnRemote`, and for a sharper reason: a non-boolean
    // leaves the gate ON. Turning off a check that refuses must be something
    // someone WROTE, never something a typo achieved on their behalf.
    assign(base.review, parsed.review, 'required', 'boolean')
    // Same shape as the two above: a non-boolean leaves the default standing, so
    // a typo cannot quietly widen a bind or permit a publish.
    assign(base.review, parsed.review, 'allowNetwork', 'boolean')
    assign(base.review, parsed.review, 'allowRemote', 'boolean')
    // An entry that is neither shape is DROPPED rather than refused, like every
    // other value here — but unlike the scalars above there is no default for it
    // to fall through to, so a dropped entry is a reviewer that silently never
    // runs. `collectUnknownKeys` cannot see it either: the default is an array,
    // and it deliberately does not walk into one. So the dropping is reported
    // separately, by `collectBadReviewers` below.
    if (Array.isArray(parsed.review.reviewers)) {
      base.review.reviewers = normalizeReviewers(parsed.review.reviewers)
    }
  }

  if (isObject(parsed.spec) && Array.isArray(parsed.spec.companionPaths)) {
    base.spec.companionPaths = normalizeFileList(parsed.spec.companionPaths)
  }

  if (isObject(parsed.live) && Array.isArray(parsed.live.migrations)) {
    base.live.migrations = normalizeFileList(parsed.live.migrations)
  }

  if (isObject(parsed.hotfix)) {
    assign(base.hotfix, parsed.hotfix, 'bump', 'string')
    assign(base.hotfix, parsed.hotfix, 'cherryPickMain', 'boolean')
    if (Array.isArray(parsed.hotfix.targets)) {
      base.hotfix.targets = normalizeFileList(parsed.hotfix.targets)
    }
  }

  return base
}

/**
 * Load and normalise `specs/.core/env.config.json` from `dir` (default cwd).
 * Returns `{ config, present, unknown }`:
 *   - missing file → `{ config: defaults, present: false, unknown: [] }`
 *     (opt-out; never throws)
 *   - present      → `{ config: merged,   present: true,  unknown: [...] }`
 * Malformed JSON → throws a clear Error (callers exit non-zero).
 *
 * `unknown` lists the dotted paths the merge ignored, for a caller to report.
 * It is advisory in the strongest sense: nothing here acts on it, and a config
 * full of strays loads exactly as it always did.
 */
function loadEnvConfig(dir = process.cwd()) {
  const base = defaults()
  const file = join(dir, CONFIG_FILE)

  let raw
  try {
    raw = readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return { config: base, present: false, unknown: [], badReviewers: [] }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`)
  }

  return {
    config: mergeConfig(base, parsed),
    present: true,
    unknown: collectUnknownKeys(parsed),
    badReviewers: collectBadReviewers(parsed),
  }
}

module.exports = {
  loadEnvConfig,
  resolveServePort,
  derivedServePort,
  servePortRoot,
  servePortReason,
  PORT_BASE,
  PORT_SPAN,
  collectUnknownKeys,
  collectBadReviewers,
  readReviewer,
  mergeConfig,
  DEFAULT_CONFIG,
  DEFAULT_REVIEWER_TIMEOUT,
  REVIEWER_FORMATS,
  CONFIG_FILE,
}
