'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const { ensureWorktreeDirTrusted } = require('./env/trust.js')
const { ensureHooks, removeHooks, HOOKS: GATE_HOOKS } = require('./env/hooks.js')
const { repoInfo, expandTokens, describeBaseBranch, baseRemote } = require('./env/resolve.js')
const { primaryAnchor } = require('./env/project.js')
const { setProjectKeys } = require('./env/projectedit.js')
const { split, strippedHash, KNOWN } = require('./conventions.js')

const ASSETS = path.join(__dirname, '..', 'assets')

// Skills, rules, and specs/.core templates are discovered from the bundled assets
// tree rather than hardcoded, so each distribution installs exactly what it ships:
// the tracker-free base carries the neutral skill set + env.config templates; a
// provider superset (built by composing its fragments in) additionally carries its
// sync skills and provider config templates, and they install with no code change.
function listSkills() {
  const dir = path.join(ASSETS, 'skills')
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort()
}

// Every file a skill ships, relative to its folder, `SKILL.md` first. A skill's
// supporting files (`<topic>.md` beside `SKILL.md`) load only when the skill
// reads them, which is what lets content one skill needs leave the
// always-loaded rules (feat-rules-budget). Dotfiles are not shipped.
function listSkillFiles(name) {
  const root = path.join(ASSETS, 'skills', name)
  const out = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else out.push(path.relative(root, p))
    }
  }
  walk(root)
  return out.sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)))
}

// Slash commands shipped as `assets/commands/*.md`, installed to
// `.claude/commands/`. Discovered from the bundled tree exactly like skills, so
// each distribution installs precisely what it ships.
function listCommands() {
  const dir = path.join(ASSETS, 'commands')
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
  } catch {
    return [] // a distribution may ship no commands
  }
}

// Hook scripts shipped as `assets/hooks/*.cjs` (or `*.mjs`), installed to
// `.claude/hooks/`. Discovered from the bundled tree like everything else, so a
// distribution installs precisely what it ships and a hook can be retired by
// deleting it.
//
// A BARE `.js` IS DELIBERATELY NOT DISCOVERED. These files are copied into the
// TARGET project, where that project's `package.json` — the one file skitterspec
// does not control — decides how node parses a `.js`. Shipping CommonJS as `.js`
// crashed the review-gate hook in every `"type": "module"` project, on every
// Bash tool call. The extension is the only thing that settles it at the file,
// so both accepted forms pin it; `env-review-hook.test.js` asserts the rule over
// the whole directory rather than over this filter.
function listHooks() {
  try {
    return fs
      .readdirSync(path.join(ASSETS, 'hooks'))
      .filter((f) => f.endsWith('.cjs') || f.endsWith('.mjs'))
      .sort()
  } catch {
    return [] // a distribution may ship no hooks
  }
}

function listRules() {
  return fs
    .readdirSync(path.join(ASSETS, 'rules'))
    .filter((f) => f.endsWith('.md'))
    .sort()
}

// Templates scaffolded into specs/.core/ (the *.example configs + their *.md docs).
// A consumer copies an example → live config to adopt the matching feature.
function listCoreTemplates() {
  return fs
    .readdirSync(path.join(ASSETS, 'core'))
    .filter((f) => f.endsWith('.example') || f.endsWith('.md'))
    .sort()
    .map((f) => path.join('core', f))
}

const SKILLS = listSkills()

const COMMANDS = listCommands()

const RULES = listRules()

const HOOKS = listHooks()

const SPEC_FOLDERS = ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']

// Opt-in config templates, scaffolded into specs/.core/ (the base ships the
// env.config isolation templates; a provider superset also ships its own).
const CORE_FILES = listCoreTemplates()

// A command file pre-executes the CLI, so it must carry a literal invocation
// that actually resolves in THIS project. Three installs are possible — local
// dependency, global, or none — and the runner differs for each.
//
// A LOCKFILE DOES NOT ANSWER THIS QUESTION. It says which runner would be used
// *if* the CLI were installed here, which is a different thing, and reading it
// as evidence of an install is inferring from an absence
// (`.claude/rules/negative-checks.md` rule 1). It cost the non-Node case
// outright: a project with no lockfile got `npx skitterspec` baked into every
// command file, and the unscoped name `skitterspec` does not exist on npm, so
// all four 404'd.
//
// So the lockfile keeps the job it is good at — picking the runner once a local
// install is established — and a ladder decides whether there is one.
const PACKAGE_MANAGERS = [
  ['pnpm-lock.yaml', 'pnpm exec'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npx'],
  ['bun.lockb', 'bunx'],
]

// Which runner would reach a LOCAL install here? Rung 1's answer only — it says
// nothing about whether the CLI is present, which is `detectRunner`'s job.
function detectPackageManager(dir) {
  for (const [lockfile, exec] of PACKAGE_MANAGERS) {
    if (fs.existsSync(path.join(dir, lockfile))) return exec
  }
  return 'npx'
}

// The bin names a distribution may expose. A provider superset ships its own
// name alongside `skitterspec`, and either proves the engine is reachable.
const ENGINE_BINS = ['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards']

// `bin` narrows the look to one name. A provider no longer answers to
// `skitterspec` (feat-global-install), so a line that runs `skitterspec` is
// only served by the base being installed — any engine name proving "an
// install" would render a command for a bin that is not there.
function binNames(bin) {
  const names = bin ? [bin] : ENGINE_BINS
  return process.platform === 'win32' ? names.flatMap((n) => [n, `${n}.cmd`, `${n}.exe`]) : names
}

// The npm package a bin comes from: each distribution's bin carries its name.
function packageForBin(bin) {
  return ENGINE_BINS.includes(bin) ? `@skitterbyte/${bin}` : distributionPackage()
}

// Rung 1 — a local install, found by walking up. Bounded at 6 levels, matching
// the hooks' own `findEngine`: a git worktree's checkout has its own
// `node_modules`, and a monorepo package hoists to the root.
function hasLocalInstall(dir, bin) {
  let at = path.resolve(dir)
  for (let i = 0; i < 6; i++) {
    for (const name of binNames(bin)) {
      if (fs.existsSync(path.join(at, 'node_modules', '.bin', name))) return true
    }
    const up = path.dirname(at)
    if (up === at) break
    at = up
  }
  return false
}

// An npx cache bin directory. Matched on the path SEGMENT, so a project that
// happens to live under a directory called `_npxtools` is not mistaken for one.
const NPX_CACHE_RE = /[\\/]_npx[\\/]/

// Rung 2 — a global install, found on PATH.
//
// WHAT WOULD FOOL THIS, and why the filter is not optional: `npx` PREPENDS its
// own cache bin directory to PATH for the processes it spawns. Verified, not
// assumed. So running `npx @skitterbyte/skitterspec init` puts a `skitterspec`
// on PATH that exists only for the duration of that one command — and probing
// for it here would bake a bare `skitterspec …` into four COMMITTED files that
// stop working the moment init exits. Excluding `_npx` entries is what makes
// this rung evidence of an install rather than evidence of the install running.
function hasPathInstall(env = process.env, bin) {
  const raw = env.PATH || env.Path || ''
  if (!raw) return false
  for (const entry of raw.split(path.delimiter)) {
    if (!entry || NPX_CACHE_RE.test(entry)) continue
    for (const name of binNames(bin)) {
      if (fs.existsSync(path.join(entry, name))) return true
    }
  }
  return false
}

/**
 * How should a command file invoke the CLI here?
 *
 * A positive-signal ladder: each rung asserts something that must be PRESENT,
 * and only the last is a fallback.
 *
 *   local — a local install; the lockfile picks the runner
 *   path  — a global install; no runner at all, the bin is invoked bare
 *   none  — neither could be found. `npx` is written as before, and the caller
 *           warns, because this is the cannot-tell case rather than a third
 *           kind of install (rule 4: the unknown routes to the harmless branch,
 *           which here is "write what we always wrote and say so").
 *
 * PROJECT-VISIBLE SIGNALS OUTRANK MACHINE-VISIBLE ONES, which is why `local` is
 * checked first. `.claude/commands/*.md` is committed and `renderCommand` feeds
 * `managedTargets`, so a render that varies by machine makes the file flip
 * between pristine and updatable as different people run `update`. A lockfile
 * is committed and answers the same everywhere; PATH is one machine's business.
 */
function detectRunner(dir, env = process.env, bin) {
  if (hasLocalInstall(dir, bin)) return { runner: detectPackageManager(dir), rung: 'local' }
  if (hasPathInstall(env, bin)) return { runner: '', rung: 'path' }
  return { runner: 'npx', rung: 'none' }
}

// The npm package this code was published in, for the cannot-tell rung's
// `npx -p`. The workspace source (`packages/common`) is private and never
// published, so it answers with the base distribution — which is what a
// consumer of the base would fetch anyway.
function distributionPackage() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    if (!pkg.private && typeof pkg.name === 'string') return pkg.name
  } catch {
    /* no readable package.json — fall through to the base */
  }
  return '@skitterbyte/skitterspec'
}

// Fill `{{exec}} <bin>` placeholders — in command files, which pre-execute the
// CLI, and in the skills, rules and setup docs that tell Claude to run it. Kept
// a pure function of (content, dir) so `managedTargets` can compare against
// exactly what an install would write — otherwise every install would hash as
// customized on the next run.
//
// NO RENDERED FORM MAY RESOLVE AN UNSCOPED NAME FROM THE REGISTRY. The bins
// (`skitterspec`, `skitterspec-<provider>`) are not npm package names: they
// 404 today, so anyone could publish one. A bare `npx skitterspec` resolves
// from `node_modules/.bin` while the install is there and FETCHES the stranger's
// package the moment it is not — a fresh worktree before its install, say. So
// the local `npx` rung gets `--no-install` (fail rather than fetch), and the
// cannot-tell rung names the scoped package outright with `-p`.
//
// The token is consumed WITH its trailing space, so an empty runner leaves
// `Bash(skitterspec …)` rather than `Bash( skitterspec …)`.
const EXEC_RE = /\{\{exec\}\}( ?)([A-Za-z0-9._-]*)/g

// Each occurrence is detected for ITS bin: a provider skill's
// `skitterspec-github` and a command's `skitterspec` come from two packages
// that may be installed in two different places.
function renderExec(content, dir, env = process.env) {
  if (!content.includes('{{exec}}')) return content
  return content.replace(EXEC_RE, (_m, sp, bin) => {
    const { runner, rung } = detectRunner(dir, env, bin || undefined)
    if (rung === 'none') return bin ? `npx -p ${packageForBin(bin)} ${bin}` : 'npx'
    const prefix = runner === 'npx' ? 'npx --no-install' : runner
    if (!prefix) return bin
    return `${prefix}${sp}${bin}`
  })
}

// --- the command launcher (bug-commands-outside-project) -------------------
//
// A command file lives in the project folder's `.claude/commands/`, but its `!`
// line runs in whatever directory the SESSION is standing in. A runner resolves
// the install from there, so in a repo whose project is a subfolder a session
// that had cd'd to the git root — or to a worktree's root — got npm's registry
// 404 instead of the engine. So on the local rung a command's `{{exec}}` renders
// as a launcher that picks the folder first:
//
//   1. the cwd, walking up, when the install is there — the healthy path, run
//      in the cwd exactly as before;
//   2. else this checkout's project folder (git toplevel + the prefix recorded
//      here at render time), then the primary checkout's — a `--docs` worktree
//      has no install of its own — run in THIS checkout's project folder, so a
//      bare command still means the spec you are standing on;
//   3. else one line naming the folder it expected, exit 1.
//
// It is `node -e`, inline, rather than a script file beside the commands,
// because finding a file from an unknown cwd is the very problem being solved,
// and a local-scope install keeps `.claude/` out of git, so a worktree may not
// have one. Node runs the engine's JS entry directly (no `.bin` shim, no
// shell), which is the one form both `/bin/sh` and cmd.exe can start — vm-bridge
// runs these lines through cmd.
//
// WHAT WOULD BREAK IT: the line passes through two shells' quoting. It is one
// double-quoted word, so the script must hold no `"`, `$`, `` ` ``, `\`, `%` or
// `!` — and neither may anything substituted into it. A prefix holding one of
// those is cannot-tell and renders as `''` (rule 4): rungs 1 and 3 still hold.
const LAUNCHER = [
  "const f=require('fs'),p=require('path'),c=require('child_process'),K='{{pkg}}',B='{{bin}}',P='{{prefix}}'",
  "const g=a=>{try{return c.execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch(e){}}",
  'const w=d=>{for(let i=0;i<6;i++){const m=p.join(d,' +
    "'node_modules',K,'package.json');if(f.existsSync(m)){const b=JSON.parse(f.readFileSync(m,'utf8')).bin;" +
    "return p.join(p.dirname(m),typeof b=='string'?b:b[B])}const u=p.dirname(d);if(u==d)return;d=u}}",
  'let d=process.cwd(),e=w(d)',
  "if(e==null){const t=g(['rev-parse','--show-toplevel']),m=g(['rev-parse','--git-common-dir']);" +
    'if(t){d=p.join(t,P);e=w(d)||m&&w(p.join(p.dirname(p.resolve(m)),P))}}',
  "if(e==null){console.error(B+': not installed for '+d+' (no node_modules/'+K+' there or above) - install it there, or run from the project folder');process.exit(1)}",
  "const r=c.spawnSync(process.execPath,[e,...process.argv.slice(1)],{cwd:d,stdio:'inherit'});process.exit(r.status==null?1:r.status)",
].join(';')

const UNSAFE_IN_LAUNCHER = /["'$`\\%!]/

// The project's folder within its git repo, as a repo path — '' at the root,
// outside a repo, or when it cannot be carried safely in the launcher.
function launcherPrefix(dir) {
  let top
  try {
    top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
  const real = (p) => {
    try {
      return fs.realpathSync.native(p)
    } catch {
      return path.resolve(p)
    }
  }
  const rel = path.relative(real(top), real(dir))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
  const prefix = rel.split(path.sep).join('/')
  return UNSAFE_IN_LAUNCHER.test(prefix) ? '' : prefix
}

function launcherFor(bin, dir) {
  const script = LAUNCHER.replace('{{pkg}}', packageForBin(bin))
    .replace('{{bin}}', bin)
    .replace('{{prefix}}', launcherPrefix(dir))
  return `node -e "${script}" --`
}

// What a command file's `!` line runs. Only the local rung changes: a global
// install and the `npx -p` fallback resolve the same from any directory.
function renderCommand(content, dir, env = process.env) {
  if (!content.includes('{{exec}}')) return content
  return content.replace(EXEC_RE, (match, _sp, bin) => {
    if (bin && detectRunner(dir, env, bin).rung === 'local') return launcherFor(bin, dir)
    return renderExec(match, dir, env)
  })
}

// Which managed files carry the token: markdown only. Hooks and JSON templates
// are copied byte for byte.
const renderable = (assetRel) => assetRel.endsWith('.md')

// --- composed-assets guard -------------------------------------------------
//
// A source package's `assets/` is PRE-composition: `<!-- seam:NAME -->` is still
// literal text that scripts/build-dist.js replaces — with a provider's fragment
// for the provider distribution, with nothing for the base. Only a built
// distribution's assets are installable.
//
// This is a POSITIVE signal, not an absence: a seam marker must be **present**
// for the guard to fire, so it cannot misfire on a tree it simply failed to read.
// And it refuses rather than repairing — installing the wrong thing is the
// expensive mistake here. In a dev-linked checkout the installed skills are
// symlinks to the composed distribution, so a `--force` install would write
// these markers straight through the link and into the built assets.
const SEAM_RE = /<!--\s*seam:[A-Za-z0-9_-]+\s*-->/

function assetFiles(dir) {
  const out = []
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return // a distribution need not ship every asset kind
    }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push(p)
    }
  }
  walk(dir)
  return out
}

// Throws when this package's assets are uncomposed. Called from the **bins** —
// the outermost boundary, and the only way a real install happens — never from
// init()/resync()/run(), which the unit tests legitimately drive against this
// source tree. Guarding any deeper would make the library untestable while
// protecting nothing extra.
function assertComposedAssets() {
  const offenders = assetFiles(ASSETS)
    .filter((f) => SEAM_RE.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ASSETS, f))
  if (!offenders.length) return
  throw new Error(
    `refusing to install: this package's assets are uncomposed (${offenders.length} ` +
      `file(s) still carry a <!-- seam:… --> marker, e.g. ${offenders[0]}).\n` +
      '  These are a workspace source package\'s assets, not a distribution\'s. ' +
      'Run "npm run build" in the skitterspec repo, then run the command again ' +
      'from the built distribution.',
  )
}

const SPEC_MARKER_START = '<!-- skitterspec:start -->'
const SPEC_MARKER_END = '<!-- skitterspec:end -->'

// `team` (the default: everything committed) or `local` (`init --local`: the
// managed files kept out of git, hooks in settings.local.json, the CLAUDE block
// in CLAUDE.local.md). Set once per run by `resolveScope`, and recorded in the
// manifest so a later `update` cannot write team-mode files into a local repo.
let scope = 'team'

const report = { created: [], updated: [], skipped: [], refused: [], removed: [], customized: [], adopted: [], healed: [], warnings: [], suggestions: [] }

function resetReport() {
  scope = 'team'
  enabledOnFlush = null
  for (const k of Object.keys(report)) report[k].length = 0
  for (const k of Object.keys(writtenHashes)) delete writtenHashes[k]
}

// Folder index files scaffolded by earlier versions, now retired. `init`/`update`
// deletes any left behind so upgrading projects don't keep stale caches.
const RETIRED_FILES = [
  path.join('specs', 'backlog', '00-index.md'),
  path.join('specs', 'complete', '00-index.md'),
]

// `/`-separated on every platform: these are the manifest's keys and the
// report's lines, and a Windows install recording `specs\\.core\\…` would read
// as a different file to every other machine (chore-windows-ci).
function rel(dir, p) {
  return path.relative(dir, p).split(path.sep).join('/') || '.'
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

// --- install manifest (safe re-run baseline) --------------------------------
//
// specs/.core/.skitterspec-manifest.json records, per managed file, the sha1 of
// the content we last wrote. It's the baseline that lets a later resync tell "an
// old version we own" (safe to update) from "a file the user edited" (keep). It
// lists only managed FILES (skills, rules, .core templates) — never user content.

const { linesDiff } = require('./lines-diff.js')

const MANIFEST_FILE = path.join('specs', '.core', '.skitterspec-manifest.json')
const MANIFEST_VERSION = 1

// Hashes of files actually written in the current run (populated by writeFile),
// reset each init() alongside `report`.
const writtenHashes = {}

// Every judgement about a managed file compares content with its line endings
// normalised. On Windows with `core.autocrlf=true` a checkout rewrites LF to
// CRLF, and an exact compare read that conversion as the user's edit: every
// skill, command and rule became "your edit — kept" and stopped updating.
// Assets ship LF, so hashes of LF files — every manifest already written — are
// unchanged by this.
function normalizeEol(content) {
  return content.replace(/\r\n/g, '\n')
}

function sameContent(a, b) {
  return normalizeEol(a) === normalizeEol(b)
}

function sha1(content) {
  return crypto.createHash('sha1').update(normalizeEol(content)).digest('hex')
}

// The full managed set for a target dir: repo-relative path, absolute path, and
// the bundled content that ships in this distribution's assets.
function managedTargets(dir) {
  const out = []
  const add = (assetRel, targetAbs, render = renderable(assetRel) ? renderExec : (c) => c) =>
    out.push({
      relPath: rel(dir, targetAbs),
      abs: targetAbs,
      bundled: render(fs.readFileSync(path.join(ASSETS, assetRel), 'utf8'), dir),
    })
  for (const name of SKILLS) {
    for (const file of listSkillFiles(name)) add(path.join('skills', name, file), path.join(dir, '.claude', 'skills', name, file))
  }
  for (const name of COMMANDS)
    add(path.join('commands', name), path.join(dir, '.claude', 'commands', name), renderCommand)
  for (const name of RULES) add(path.join('rules', name), path.join(dir, '.claude', 'rules', name))
  for (const name of HOOKS) add(path.join('hooks', name), path.join(dir, '.claude', 'hooks', name))
  for (const asset of CORE_FILES) add(asset, path.join(dir, 'specs', '.core', path.basename(asset)))
  return out
}

// Read the manifest (tolerant: missing/malformed → an empty baseline).
// `baselined` answers a question `files` cannot: could this manifest have SEEN
// a path? It is true only when the file parsed into the expected shape AND
// records at least one entry — a POSITIVE signal, not an absence, which is what
// lets `managedState` read a path's absence from it as evidence of anything
// (`.claude/rules/negative-checks.md` rule 1).
//
// WHAT WOULD FOOL IT: nothing silently. A missing manifest and a malformed one
// both fall into the same empty baseline below — correct for reading hashes,
// and useless for reasoning about absence, since on a repo with no manifest yet
// EVERY path is absent. Both answer `baselined: false`, so the one conclusion
// that depends on it is simply not drawn.
function readManifest(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
      // KEYS ARE `/`-SEPARATED ON READ, whoever wrote them. A Windows install
      // before chore-windows-ci recorded `.claude\\skills\\…`; looked up by the
      // `/` paths every caller now uses, its records went missing — and a
      // missing record is what turns a user's edited retired file into one
      // that gets deleted. No managed path contains a backslash, so this
      // cannot merge two genuine entries.
      const files = {}
      for (const [key, hash] of Object.entries(parsed.files)) files[key.replace(/\\/g, '/')] = hash
      return {
        version: parsed.version || MANIFEST_VERSION,
        files,
        baselined: Object.keys(files).length > 0,
        // Absent means team: every manifest written before `--local` existed
        // reads exactly as it did.
        scope: parsed.scope === 'local' ? 'local' : 'team',
        // Absent means enabled: only `disable` writes the field.
        enabled: parsed.enabled !== false,
        // The package that wrote it — what `update --all` runs here. Absent on
        // manifests written before feat-global-install: cannot tell, and the
        // caller infers it rather than this guessing.
        distribution: typeof parsed.distribution === 'string' ? parsed.distribution : null,
      }
    }
  } catch {
    /* missing or malformed → empty baseline */
  }
  return { version: MANIFEST_VERSION, files: {}, baselined: false, scope: 'team', enabled: true, distribution: null }
}

function writeManifest(dir, files, { local = false, enabled = true } = {}) {
  const target = path.join(dir, MANIFEST_FILE)
  ensureDir(path.dirname(target))
  const sorted = {}
  for (const k of Object.keys(files).sort()) sorted[k] = files[k]
  const body = { version: MANIFEST_VERSION, distribution: distributionPackage(), ...(local ? { scope: 'local' } : {}), files: sorted }
  // Written only when false, so an enabled install's manifest reads exactly as
  // every manifest written before `disable` existed.
  if (!enabled) body.enabled = false
  fs.writeFileSync(target, JSON.stringify(body, null, 2) + '\n')
}

// Classify a managed file against the manifest baseline.
//   missing    — not on disk
//   pristine   — ours to update: it matches the package asset, or the hash we recorded
//   customized — on disk but differs from both — a user edit; keep it
//   adopted    — a path this version has NEWLY CLAIMED, where the project
//                already had a file: it differs from what we ship, and the
//                manifest that could have named it does not. Keep it too — the
//                two states differ only in what the report CLAIMS about it.
//
// The split exists because `customized` made a false statement about the second
// case. "Your edit — kept" describes our file at a path upstream had not
// claimed, and the reader acts on it: v21 renamed the commit hook to
// `review-gate.cjs`, which is the same name anyone would have picked to work
// around v20's ESM crash — so their shim was kept, the real hook was never
// installed, and `review-gate.js` was pruned out from under it. The shim fails
// open, so the gate went silently absent under a report that said success.
//
// WHAT WOULD FOOL THIS, and why neither does:
//   - A repo with no manifest (or an unreadable one) has EVERY path absent.
//     `baselined` is the positive signal that gates the conclusion, so those
//     fall back to `customized` — which keeps the file either way
//     (`.claude/rules/negative-checks.md` rules 1 and 4).
//   - The signal is ONE-SHOT. `flushManifest`'s migration seed gives any
//     present managed file an entry on the very next run, so an adopted path
//     reads `customized` from then on. Anyone who already upgraded has spent
//     it — which is why the `.cjs` trap is also written into MIGRATION.md,
//     where that reader is actually looking.
//
// `bundled` (the current package asset) is optional but decisive: a file whose
// CONTENT equals what we ship is not customized, whatever the manifest says.
// Without that check a stale hash pinned the file out of updates permanently —
// anything that changed it out-of-band (an errant tool, a partial restore, a
// manifest lost and re-seeded at the wrong version) froze it for good, silently.
// Comparing content first makes the tool self-healing after any restore.
// `pruneRetiredManaged` passes no `bundled` on purpose: the package no longer
// ships that file, so there is nothing to compare it against.
function managedState(dir, relPath, manifest, bundled) {
  // Manifest keys are `/`-separated; a caller holding an OS path still finds
  // its file's record (chore-windows-ci).
  relPath = String(relPath).split(path.sep).join('/')
  const abs = path.join(dir, relPath)
  if (!fs.existsSync(abs)) return 'missing'
  const onDisk = fs.readFileSync(abs, 'utf8')
  if (bundled !== undefined && sameContent(onDisk, bundled)) return 'pristine'
  const known = manifest.files[relPath]
  if (known) return sha1(onDisk) === known ? 'pristine' : 'customized'
  return manifest.baselined ? 'adopted' : 'customized'
}

// Reconcile and persist the manifest after an install/resync run: keep prior
// entries, apply files written this run, seed any pre-existing managed file that
// has no entry yet from its bundled hash (migration for repos predating the
// manifest), and prune entries whose file is gone.
function flushManifest(dir) {
  // Only managed files belong in the manifest — never live user config (e.g. an
  // env.config.json that installIsolation happens to write through writeFile).
  const managed = managedTargets(dir)
  const managedRel = new Set(managed.map((t) => t.relPath))
  const prior = readManifest(dir)
  const merged = { ...prior.files, ...writtenHashes }
  const next = {}
  for (const [relPath, hash] of Object.entries(merged)) {
    if (managedRel.has(relPath)) next[relPath] = hash
  }
  for (const { relPath, abs, bundled } of managed) {
    if (!next[relPath] && fs.existsSync(abs)) next[relPath] = sha1(bundled) // migration seed
  }
  for (const relPath of Object.keys(next)) {
    if (!fs.existsSync(path.join(dir, relPath))) delete next[relPath] // prune gone
  }
  writeManifest(dir, next, { local: scope === 'local', enabled: enabledOnFlush === null ? prior.enabled : enabledOnFlush })
}

// Set by a run that decides the install's switch: `init` turns it on, and
// `null` keeps whatever the manifest says (`update` on a disabled install).
let enabledOnFlush = null

function writeFile(dir, target, content, { force }) {
  // A dangling symlink (its target no longer exists) is invisible to existsSync,
  // which follows the link — but the link itself is still on disk, so a plain
  // writeFileSync would follow it into a missing directory and throw ENOENT.
  // Drop the broken link and write a real file in its place.
  let link = null
  try {
    link = fs.lstatSync(target)
  } catch {
    /* no such path — nothing to clean up */
  }
  if (link && link.isSymbolicLink() && !fs.existsSync(target)) {
    fs.unlinkSync(target)
  }
  // A LIVE symlink is the opposite case, and `--force` is what makes it
  // dangerous: `writeFileSync` follows the link, so forcing would write composed
  // content — seam markers resolved, provider text spliced in — straight through
  // it and into whatever it points at. In a checkout that dogfoods its own
  // assets that is `packages/*/assets`, i.e. the SOURCE the link exists to keep
  // live. Refuse: the staleness `--force` was reached for is a smaller problem
  // than corrupting the file it would overwrite.
  //
  // WHAT WOULD MAKE THIS LIE: a HARD link. It has no distinguishing lstat — it
  // simply is the file — so it takes the same corrupting path and nothing here
  // can see it. Out of scope deliberately, and said out loud rather than left to
  // be discovered; nothing in this project's install creates one.
  //
  // It cannot fire in an ordinary consumer install, because nothing there is
  // linked — `skitterspec update` writes copies by design.
  if (force && link && link.isSymbolicLink() && fs.existsSync(target)) {
    report.refused.push(rel(dir, target))
    return
  }
  if (fs.existsSync(target)) {
    if (!force) {
      report.skipped.push(rel(dir, target))
      return
    }
    const existing = fs.readFileSync(target, 'utf8')
    if (existing === content) {
      // Already the content we'd write — record it as ours (pristine).
      writtenHashes[rel(dir, target)] = sha1(content)
      report.skipped.push(rel(dir, target))
      return
    }
    fs.writeFileSync(target, content)
    writtenHashes[rel(dir, target)] = sha1(content)
    report.updated.push(rel(dir, target))
    return
  }
  ensureDir(path.dirname(target))
  fs.writeFileSync(target, content)
  writtenHashes[rel(dir, target)] = sha1(content)
  report.created.push(rel(dir, target))
}

function copyAsset(dir, assetRelPath, targetAbs, opts) {
  const raw = fs.readFileSync(path.join(ASSETS, assetRelPath), 'utf8')
  const render = assetRelPath.startsWith(`commands${path.sep}`) ? renderCommand : renderExec
  const content = renderable(assetRelPath) ? render(raw, dir) : raw
  writeFile(dir, targetAbs, content, opts)
}

function installSkills(dir, opts) {
  for (const name of SKILLS) {
    for (const file of listSkillFiles(name)) {
      copyAsset(dir, path.join('skills', name, file), path.join(dir, '.claude', 'skills', name, file), opts)
    }
  }
}

function installCommands(dir, opts) {
  for (const name of COMMANDS) {
    copyAsset(dir, path.join('commands', name), path.join(dir, '.claude', 'commands', name), opts)
  }

  // ONLY on the cannot-tell rung, and it warns rather than refusing: `init` has
  // real work to do either way — skills, rules, folders — and none of it needs
  // the CLI reachable later. Silence here is what let a project install cleanly
  // and hand back four commands that 404 on first use.
  //
  // It asks for `skitterspec` BY NAME: a provider no longer answers to it
  // (feat-global-install), so a provider installed alone leaves every command
  // and every skill's `skitterspec …` with nothing behind it — and the fix is
  // the base installed alongside, which the warning names.
  if (COMMANDS.length && detectRunner(dir, process.env, 'skitterspec').rung === 'none') {
    const base = packageForBin('skitterspec')
    const beside = distributionPackage() === base ? '' : ` alongside ${distributionPackage()}`
    report.warnings.push(
      `the skitterspec CLI could not be found here, so the ${COMMANDS.length} slash ` +
        `command(s) were written to fetch it on every run (\`npx -p ${base}\`) — ` +
        `install ${base}${beside} (npm i -g, or as a dev ` +
        'dependency) and re-run `skitterspec update` to rewrite them',
    )
  }
}

function installRule(dir, opts) {
  for (const name of RULES) {
    copyAsset(
      dir,
      path.join('rules', name),
      path.join(dir, '.claude', 'rules', name),
      opts,
    )
  }
}

// The project's own conventions — its typecheck and test commands — written
// once from a template and then the project's to edit. It is deliberately NOT
// a managed file: no manifest entry, never overwritten (not even by
// `--force`), never pruned, so filling it in trips no hash guard. That is the
// point of it: the conventions used to live inside the managed
// `spec-planning.md`, where tailoring them made the whole file "customized".
const CONVENTIONS_FILE = path.join('.claude', 'rules', 'project-conventions.md')

function installConventions(dir) {
  const target = path.join(dir, CONVENTIONS_FILE)
  if (fs.existsSync(target)) return // the project's, whatever it holds
  ensureDir(path.dirname(target))
  fs.writeFileSync(target, fs.readFileSync(path.join(ASSETS, 'project-conventions.md'), 'utf8'))
  report.created.push(rel(dir, target))
}

// A customized `spec-planning.md` from before feat-rules-budget, whose only
// edits are in its old "Project conventions" section: carry the section into
// `project-conventions.md` and take the new rule, so the host stops loading
// 66k of the old one. Runs before the managed loop, which then finds the rule
// pristine and records it. Under `--force` it still runs first, so a
// forced update keeps the conventions the force would otherwise overwrite.
//
// WHAT WOULD FOOL THIS: an edit that exactly restores some other shipped
// version's text outside the section. That is still unedited text we shipped,
// so replacing it loses nothing. Everything else is cannot-tell: the file is
// kept and a warning says how to finish by hand (negative-checks.md rule 4).
function migrateConventions(dir, manifest, force) {
  const relPath = '.claude/rules/spec-planning.md'
  const target = managedTargets(dir).find((t) => t.relPath === relPath)
  if (!target) return
  const state = managedState(dir, relPath, manifest, target.bundled)
  if (state !== 'customized' && state !== 'adopted') return
  const onDisk = fs.readFileSync(target.abs, 'utf8')
  const conventions = path.join(dir, CONVENTIONS_FILE)
  const template = fs.readFileSync(path.join(ASSETS, 'project-conventions.md'), 'utf8')
  const parts = split(onDisk)
  const known = parts && KNOWN().has(strippedHash(onDisk))
  const free = !fs.existsSync(conventions) || sameContent(fs.readFileSync(conventions, 'utf8'), template)
  if (!known || !free) {
    if (force) return // --force replaces the file anyway; nothing to advise
    report.warnings.push(
      `${relPath} kept (${Math.round(onDisk.length / 1000)}k chars, edited) — it loads in every session. ` +
        `Move your edits into ${CONVENTIONS_FILE.split(path.sep).join('/')}, then run \`skitterspec update --force\``,
    )
    return
  }
  ensureDir(path.dirname(conventions))
  fs.writeFileSync(conventions, `# Project conventions\n\n${parts.body}\n`)
  report.created.push(`${CONVENTIONS_FILE.split(path.sep).join('/')} (moved from ${relPath})`)
  fs.writeFileSync(target.abs, target.bundled)
  writtenHashes[relPath] = sha1(target.bundled)
}

// What Claude Code loads into EVERY session from this install: each rule under
// `.claude/rules/` that skitterspec wrote (managed, or the conventions file)
// and that carries no `paths:` front-matter, plus the managed CLAUDE.md block.
// The budget test hangs on this (feat-rules-budget).
//
// WHAT WOULD FOOL THIS: front-matter it cannot parse. Anything other than a
// leading `---` block holding a `paths:` key counts as always-loaded, so a
// cannot-tell over-counts — the direction that fails the budget loudly rather
// than passing it quietly.
function hasPathsFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  return Boolean(m && /^paths:/m.test(m[1]))
}

function alwaysLoaded(dir) {
  const rows = []
  const rules = [
    ...managedTargets(dir)
      .filter((t) => t.relPath.startsWith('.claude/rules/'))
      .map((t) => t.abs),
    path.join(dir, CONVENTIONS_FILE),
  ]
  for (const abs of [...new Set(rules)]) {
    if (!fs.existsSync(abs)) continue
    const text = fs.readFileSync(abs, 'utf8')
    if (!hasPathsFrontMatter(text)) rows.push({ path: rel(dir, abs), chars: text.length })
  }
  for (const name of ['CLAUDE.md', 'CLAUDE.local.md']) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const start = text.indexOf(SPEC_MARKER_START)
    const end = text.indexOf(SPEC_MARKER_END, start)
    if (start === -1 || end === -1) continue
    rows.push({ path: `${name} (skitterspec section)`, chars: end + SPEC_MARKER_END.length - start })
  }
  return { rows, total: rows.reduce((n, r) => n + r.chars, 0) }
}

// Register the review-gate hook in the project's committed settings, so a
// phase that owes a verdict is enforced one level below the skills. Best-effort
// in exactly the way `trustWorktreeRoot` is: a settings file we cannot parse is
// reported and left alone, never rewritten, and never fatal — the hook is an
// extra layer, and the engine and `/spec-next` hold the gate without it.
function registerReviewGateHook(dir) {
  // "hooks", plural, because two ship now — the review gate and the main guard.
  // The label names the file and the subject rather than one script, so adding a
  // third does not leave a report that undercounts what it wrote.
  const file = scope === 'local' ? '.claude/settings.local.json' : '.claude/settings.json'
  const label = `${file} (skitterspec hooks)`
  let res
  try {
    res = ensureHooks(dir, { local: scope === 'local' })
  } catch {
    report.warnings.push(`could not write ${file} — skitterspec hooks not registered`)
    return
  }
  if (res.reason === 'malformed') {
    report.warnings.push(`${file} is not valid JSON — did not register the skitterspec hooks`)
  } else if (res.reason === 'created') {
    report.created.push(label)
  } else if (res.reason === 'added') {
    report.updated.push(label)
  } else if (res.reason === 'migrated') {
    // A WRITE, so it may not fall through to `skipped`. It was doing exactly
    // that: rewriting the registered path and then reporting "already
    // registered" — a run that acts and says it did not, which is the shape of
    // the bug this whole change exists to fix.
    report.updated.push(`${file} (skitterspec hooks repointed at the renamed script)`)
  } else {
    report.skipped.push(`${file} (skitterspec hooks already registered)`)
  }
}

function installHooks(dir, opts) {
  for (const name of HOOKS) {
    copyAsset(dir, path.join('hooks', name), path.join(dir, '.claude', 'hooks', name), opts)
  }
  registerReviewGateHook(dir)
}

function installFolders(dir) {
  for (const folder of SPEC_FOLDERS) {
    const abs = path.join(dir, 'specs', folder)
    if (!fs.existsSync(abs)) {
      ensureDir(abs)
      report.created.push(rel(dir, abs) + '/')
      // keep otherwise-empty folders in git
      if (!fs.readdirSync(abs).length) {
        fs.writeFileSync(path.join(abs, '.gitkeep'), '')
      }
    } else {
      report.skipped.push(rel(dir, abs) + '/')
    }
  }
}

// Delete retired folder index files left by earlier versions. If removing one
// empties its bucket, drop a `.gitkeep` so the folder stays tracked in git.
function removeRetiredFiles(dir) {
  for (const relPath of RETIRED_FILES) {
    const target = path.join(dir, relPath)
    if (!fs.existsSync(target)) continue
    fs.unlinkSync(target)
    report.removed.push(rel(dir, target))
    const folder = path.dirname(target)
    if (fs.existsSync(folder) && !fs.readdirSync(folder).length) {
      fs.writeFileSync(path.join(folder, '.gitkeep'), '')
    }
  }
}

// Prune a file the manifest records as managed but the current package no longer
// ships — a retired skill (e.g. `spec-pull` after the one-way switch), rule, or
// template. Without this, upgrading leaves a live, model-visible skill on disk
// whose instructions invoke a command that no longer exists. Delete it only when
// PRISTINE (still matches the hash we last wrote) so a user edit is never lost; a
// customized retired file is kept with a warning. An emptied skill folder is
// removed. Takes the pre-flush manifest (which still holds the retired entries).
function pruneRetiredManaged(dir, manifest) {
  const managedRel = new Set(managedTargets(dir).map((t) => t.relPath))
  for (const relPath of Object.keys(manifest.files || {})) {
    if (managedRel.has(relPath)) continue // still shipped by this version
    const abs = path.join(dir, relPath)
    if (!fs.existsSync(abs)) continue // already gone
    if (managedState(dir, relPath, manifest) === 'customized') {
      report.warnings.push(`retired but kept (you edited it): ${relPath} — delete manually if unused`)
      continue
    }
    fs.unlinkSync(abs)
    report.removed.push(rel(dir, abs))
    const folder = path.dirname(abs)
    if (fs.existsSync(folder) && !fs.readdirSync(folder).length) fs.rmdirSync(folder)
  }
}

// Scaffold the opt-in isolation templates into specs/.core/ (the example config
// + its field docs). Copied, not activated: the feature stays off until the
// consumer copies env.config.json.example → env.config.json.
function installCore(dir, opts) {
  for (const asset of CORE_FILES) {
    copyAsset(
      dir,
      asset,
      path.join(dir, 'specs', '.core', path.basename(asset)),
      opts,
    )
  }
}

// Activate opt-in per-spec isolation: write specs/.core/env.config.json from the
// example asset so /spec-start provisions a worktree for every in-progress spec.
// Only called when the operator opts in, and never on `update` (adopting isolation
// is a deliberate choice, not something a re-sync flips on). Idempotent: writeFile
// never clobbers an existing env.config.json without --force.
function installIsolation(dir, { enabled, workspaceMode, project = {} }, opts) {
  if (!enabled) return
  const target = path.join(dir, 'specs', '.core', 'env.config.json')
  copyAsset(dir, path.join('core', 'env.config.json.example'), target, opts)

  // Only 'checkout' is written; 'worktree' is already what the template says and
  // what the loader defaults to, so the common path leaves the file untouched.
  // Guarded by existsSync because copyAsset legitimately declines to overwrite a
  // config the operator already customized — rewriting it here would undo that.
  if (workspaceMode === 'checkout' && fs.existsSync(target)) {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'))
    parsed.mode = 'checkout'
    fs.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`)
  }
  // --name / --category, edited in rather than regenerated, so a config the
  // operator already customized keeps everything but the two values asked for.
  if ((typeof project.name === 'string' || typeof project.category === 'string') && fs.existsSync(target)) {
    const text = fs.readFileSync(target, 'utf8')
    const edited = setProjectKeys(text, project)
    if (edited !== text) fs.writeFileSync(target, edited)
  }
  trustWorktreeRoot(dir)
}

// Activate opt-in release gating: write specs/.core/gating.config.json from the
// example asset, so /spec and friends start asking whether a change ships behind
// a feature flag and recording the answer.
//
// Only called when the operator opts in, and NEVER on `update` — for the same
// reason as isolation: adopting a policy is a deliberate choice, not something a
// re-sync flips on. Idempotent; copyAsset never clobbers an existing config
// without --force, so an operator's edited `guidance` survives a re-init.
function installGating(dir, { enabled }, opts) {
  if (!enabled) return
  copyAsset(
    dir,
    path.join('core', 'gating.config.json.example'),
    path.join(dir, 'specs', '.core', 'gating.config.json'),
    opts,
  )
}

// Seed the absolute worktree root into .claude/settings.local.json (gitignored)
// so the operator enabling isolation isn't prompted on every edit into a
// freshly-provisioned worktree. Best-effort: an unreadable config or malformed
// settings file is reported, never fatal. `spec-env up` re-ensures this on every
// provision, so a miss here self-heals.
function trustWorktreeRoot(dir) {
  let root
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'),
    )
    root = cfg && cfg.worktree && cfg.worktree.root
  } catch {
    /* fall through to the warning below */
  }
  if (!root) {
    report.warnings.push('could not read worktree.root — skipped trusting the worktree dir')
    return
  }
  // Resolved against the REPO's root, and named for it, exactly as `spec-env`
  // resolves it — `dir` is the project folder, which is a subfolder of the repo
  // for some projects (feat-subfolder-project). Not a repo → `dir`, as before.
  const anchor = primaryAnchor(dir, (args) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return null
    }
  })
  const { repo, repoSlug } = repoInfo(anchor.root)
  const rootAbs = path.resolve(anchor.root, expandTokens(root, { repo, repoSlug }))
  const res = ensureWorktreeDirTrusted(dir, rootAbs)
  const label = '.claude/settings.local.json (trusted worktree root)'
  if (res.reason === 'malformed') {
    report.warnings.push(
      '.claude/settings.local.json is not valid JSON — did not trust the worktree' +
        ` dir; add ${rootAbs} to permissions.additionalDirectories yourself`,
    )
  } else if (res.reason === 'created') {
    report.created.push(label)
  } else if (res.reason === 'added') {
    report.updated.push(label)
  } else {
    report.skipped.push('.claude/settings.local.json (worktree root already trusted)')
  }
}

// Is the CLAUDE.md section this project has installed the one we ship?
//
// THREE answers, not two. `differs` deliberately does NOT mean "stale": the
// block is a COPY, so a difference is either an out-of-date copy or the user's
// own edit, and from here those read identically. Rule 4 of
// `.claude/rules/negative-checks.md` — route the unknown case to the harmless
// branch, which here means reporting a difference and naming the fix rather
// than accusing them of being behind.
//
// WHAT WOULD FOOL THIS: absent markers mean the section was never installed, OR
// that someone stripped it deliberately (`stripClaudeMdSection` exists and is
// reachable from `reset`). Neither is a fault, so both answer `not installed`
// and neither is reported as a problem.
// The file the CLAUDE block lives in: CLAUDE.md, or CLAUDE.local.md for a local
// install. Read from the manifest when no run has set the scope, so `--check`
// looks where the block actually is.
function claudeMdName(dir) {
  const local = scope === 'local' || readManifest(dir).scope === 'local'
  return local ? 'CLAUDE.local.md' : 'CLAUDE.md'
}

function claudeMdSectionState(dir) {
  const target = path.join(dir, claudeMdName(dir))
  if (!fs.existsSync(target)) return 'not installed'
  const existing = fs.readFileSync(target, 'utf8')
  if (!existing.includes(SPEC_MARKER_START) || !existing.includes(SPEC_MARKER_END)) {
    return 'not installed'
  }
  const shipped = fs.readFileSync(path.join(ASSETS, 'claude-md-section.md'), 'utf8').trim()
  const start = existing.indexOf(SPEC_MARKER_START) + SPEC_MARKER_START.length
  const installed = existing.slice(start, existing.indexOf(SPEC_MARKER_END)).trim()
  return installed === shipped ? 'fresh' : 'differs'
}

// `update --check`: say what `update` would change, write nothing, exit 0.
// It reports; `update` without the flag stays the only thing that touches a
// file. This exists because the section is a copy and a copy goes quietly out
// of date — this repo's own was a whole spec behind the template it ships,
// through a spec about that template, with every test green.
function checkSync(dir, { claudeMd = true, log = console.log } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  const manifest = readManifest(dir)
  const rows = []
  // Mirror `resyncManagedFile`'s decision exactly rather than re-deriving it:
  // missing → it would create; customized → it would KEEP yours and say so;
  // pristine → it would write only when the shipped content actually differs.
  for (const { relPath, abs, bundled } of managedTargets(dir)) {
    const state = managedState(dir, relPath, manifest, bundled)
    if (state === 'missing') rows.push([relPath, 'missing — would be created'])
    else if (state === 'customized') rows.push([relPath, 'your edit — kept (--force overwrites)'])
    else if (state === 'adopted')
      rows.push([relPath, 'adopted upstream — yours kept, theirs not installed (--force takes theirs)'])
    else if (!sameContent(fs.readFileSync(abs, 'utf8'), bundled)) rows.push([relPath, 'out of date — would be updated'])
  }
  const section = claudeMd ? claudeMdSectionState(dir) : 'fresh'
  // A healthy area says NOTHING. A report that lists what is already fine is a
  // report people learn to skim, and then the one line that mattered is missed.
  if (section === 'differs') {
    rows.push([
      `${claudeMdName(dir)} (spec workflow section)`,
      'differs from the shipped one — `update` would replace it (it is a copy, so this is either your edit or an out-of-date one)',
    ])
  }
  if (!rows.length) log('skitterspec update --check: everything is up to date.')
  else {
    log('skitterspec update --check: `skitterspec update` would:')
    for (const [name, why] of rows) log(`  ${name} — ${why}`)
  }
  return { rows, section }
}

function installClaudeMd(dir, { mode }) {
  const section = fs.readFileSync(path.join(ASSETS, 'claude-md-section.md'), 'utf8').trim()
  const block = `${SPEC_MARKER_START}\n${section}\n${SPEC_MARKER_END}\n`
  const name = claudeMdName(dir)
  const target = path.join(dir, name)

  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, name === 'CLAUDE.md' ? `# ${path.basename(dir)}\n\n${block}` : block)
    report.created.push(name)
    return
  }

  const existing = fs.readFileSync(target, 'utf8')

  if (existing.includes(SPEC_MARKER_START) && existing.includes(SPEC_MARKER_END)) {
    if (mode !== 'update') {
      report.skipped.push(`${name} (spec workflow already present)`)
      return
    }
    const re = new RegExp(`${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`)
    const next = existing.replace(re, block)
    if (next === existing) {
      report.skipped.push(`${name}`)
    } else {
      fs.writeFileSync(target, next)
      report.updated.push(`${name} (spec workflow section)`)
    }
    return
  }

  if (/^##\s+Spec workflow/m.test(existing)) {
    report.skipped.push(`${name} (has a manual "Spec workflow" section — left alone)`)
    return
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n'
  fs.writeFileSync(target, `${existing}${sep}${block}`)
  report.updated.push(`${name} (appended spec workflow section)`)
}

// --- detection, resync, reset (safe re-run) ---------------------------------

// True when the repo looks already set up: any managed file present, any spec
// lifecycle folder, or the CLAUDE.md spec marker (Decision 1 — detect eagerly).
// Is skitterspec already installed here? Matched on what we ACTUALLY install —
// our managed files, our lifecycle folders, our CLAUDE.md marker — never on
// `.claude/` merely existing: someone else's skills are not evidence of ours,
// and reading them as ours would treat every Claude Code project as a
// half-finished install.
function isExistingSetup(dir) {
  if (managedTargets(dir).some((t) => fs.existsSync(t.abs))) return true
  if (SPEC_FOLDERS.some((f) => fs.existsSync(path.join(dir, 'specs', f)))) return true
  return ['CLAUDE.md', 'CLAUDE.local.md'].some((name) => {
    const claude = path.join(dir, name)
    return fs.existsSync(claude) && fs.readFileSync(claude, 'utf8').includes(SPEC_MARKER_START)
  })
}

// RESYNC: bring managed files to the latest bundled version WITHOUT clobbering
// user edits. Per file: missing → create; pristine (matches the manifest) →
// update; customized (edited) → keep + report, unless `force`.
function resyncManagedFile(dir, target, manifest, force) {
  const { relPath, abs, bundled } = target
  const state = managedState(dir, relPath, manifest, bundled)
  const write = (bucket) => {
    ensureDir(path.dirname(abs))
    fs.writeFileSync(abs, bundled)
    writtenHashes[relPath] = sha1(bundled)
    report[bucket].push(relPath)
  }
  if (state === 'missing') return write('created')
  // `adopted` writes exactly as `customized` does — keep unless forced. Only the
  // bucket differs, because only the REPORT was ever wrong about it.
  if (state === 'customized' || state === 'adopted') {
    if (force) return write('updated')
    writtenHashes[relPath] = manifest.files[relPath] || writtenHashes[relPath] // keep baseline
    // Carry the change the user just DECLINED. A bare filename tells them a
    // decision was made on their behalf but not what it was, which leaves
    // "clobber and re-apply my edits by hand" as the only safe way to upgrade.
    const { added, removed, hunks } = linesDiff(fs.readFileSync(abs, 'utf8'), bundled)
    return report[state].push({ relPath, added, removed, hunks })
  }
  // pristine — update only if the bundled content actually changed
  if (sameContent(fs.readFileSync(abs, 'utf8'), bundled)) {
    // The file is ours and current, but the manifest disagreed — record the
    // repair rather than healing in silence: a file that quietly starts
    // updating again is as opaque as one that quietly stopped.
    if (manifest.files[relPath] !== sha1(bundled)) report.healed.push(relPath)
    writtenHashes[relPath] = sha1(bundled)
    return report.skipped.push(relPath)
  }
  write('updated')
}

function resync(dir, { force = false, claudeMd = true, diff = false, local = false } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  resetReport()
  resolveScope(dir, local)
  if (scope === 'local') convertCommitted(dir)
  const manifest = readManifest(dir)
  migrateConventions(dir, manifest, force)
  for (const t of managedTargets(dir)) resyncManagedFile(dir, t, manifest, force)
  installConventions(dir)
  installFolders(dir)
  removeRetiredFiles(dir)
  pruneRetiredManaged(dir, manifest)
  // The hook SCRIPT arrives above, as one more managed target; registering it is
  // a separate write to a file we do not manage, so it has to be asked for here.
  // It is easy to read this as duplication of `installHooks()` and delete it —
  // it is not. `installHooks()` is unreachable from this path, and the two
  // halves being in different functions is exactly how they drifted apart once:
  // `update` copied `.claude/hooks/` and registered nothing, for every upgrading
  // project, while reporting a file created. `init-review-gate-hook.test.js`
  // asserts over the entry points rather than over this call.
  // A disabled install stays disabled through an update: the files refresh,
  // and the two things Claude reads from outside them are not written back.
  const disabled = scope === 'local' && !manifest.enabled
  if (disabled) report.skipped.push('hooks and CLAUDE.local.md block (disabled — skitterspec enable turns them on)')
  else {
    registerReviewGateHook(dir)
    if (claudeMd) installClaudeMd(dir, { mode: 'update' })
  }
  suggestReleaseWith(dir)
  flushManifest(dir)
  if (scope === 'local') writeLocalExcludes(dir)
  printReport(dir, 'resync', { diff })
}

// The never-touch set: START AGAIN may only delete a known managed file, and may
// never delete spec content or active config (defense-in-depth — the manifest
// never lists these, but a tampered/foreign entry must still be refused).
const PROTECTED_SPEC_BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']
const PROTECTED_CONFIG = ['env.config.json', 'linear.config.json', 'jira.config.json', 'github.config.json', 'azure-boards.config.json']
const PROTECTED_DIRS = ['linear-base', 'linear-backups', 'jira-base', 'jira-backups', 'github-base', 'github-backups', 'azure-base', 'azure-backups']

function assertSafeToDelete(relPath, managedSet) {
  const norm = relPath.split(path.sep).join('/')
  for (const b of PROTECTED_SPEC_BUCKETS) {
    if (norm.startsWith(`specs/${b}/`)) throw new Error(`refusing to delete spec content: ${relPath}`)
  }
  if (PROTECTED_CONFIG.includes(path.posix.basename(norm))) {
    throw new Error(`refusing to delete active config: ${relPath}`)
  }
  for (const d of PROTECTED_DIRS) {
    if (norm.includes(`/${d}/`)) throw new Error(`refusing to delete sync state: ${relPath}`)
  }
  if (!managedSet.has(norm)) throw new Error(`refusing to delete a non-managed path: ${relPath}`)
}

// Remove the marked spec-workflow block from CLAUDE.md (leaves the rest intact).
function stripClaudeMdSection(dir) {
  const target = path.join(dir, 'CLAUDE.md')
  if (!fs.existsSync(target)) return
  const existing = fs.readFileSync(target, 'utf8')
  const next = existing.replace(
    new RegExp(`\\n?${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`),
    '\n',
  )
  if (next !== existing) {
    fs.writeFileSync(target, next)
    report.removed.push('CLAUDE.md (spec workflow section)')
  }
}

// START AGAIN: delete exactly the manifest-listed managed files (each guarded),
// strip the CLAUDE.md marked section, then reinstall fresh. Never touches a
// non-manifest path. Destructive by design for managed files (that's the point).
function reset(dir, { claudeMd = true } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  resetReport()
  const manifest = readManifest(dir)
  const managedSet = new Set(managedTargets(dir).map((t) => t.relPath.split(path.sep).join('/')))
  for (const relPath of Object.keys(manifest.files)) {
    assertSafeToDelete(relPath, managedSet)
    const abs = path.join(dir, relPath)
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs)
      report.removed.push(relPath)
    }
  }
  if (claudeMd) stripClaudeMdSection(dir)
  installSkills(dir, { force: true })
  installCommands(dir, { force: true })
  installRule(dir, { force: true })
  installHooks(dir, { force: true })
  installFolders(dir)
  removeRetiredFiles(dir)
  installCore(dir, { force: true })
  if (claudeMd) installClaudeMd(dir, { mode: 'init' })
  flushManifest(dir)
  printReport(dir, 'reset')
}

function printReport(dir, mode, { diff = false } = {}) {
  const line = (label, items) => {
    if (!items.length) return
    process.stdout.write(`\n${label}:\n`)
    for (const it of items) process.stdout.write(`  ${it}\n`)
  }
  process.stdout.write(`\nskitterspec ${mode} → ${dir}\n`)
  line('created', report.created)
  line('updated', report.updated)
  line('removed', report.removed)
  line(
    'customized (kept)',
    report.customized.map((c) => `${c.relPath}  +${c.added} \u2212${c.removed}`),
  )
  line(
    'adopted upstream (kept — ours was never installed)',
    report.adopted.map((c) => `${c.relPath}  +${c.added} \u2212${c.removed}`),
  )
  line('manifest repaired', report.healed)
  line('unchanged', report.skipped)
  if (report.refused.length) {
    process.stdout.write('\nrefused (a symlink — writing would overwrite what it points at):\n')
    for (const it of report.refused) process.stdout.write(`  ${it}\n`)
    process.stdout.write(
      '  These are links into the shipped assets. --force would follow them and\n' +
        '  write composed content into the source. Unlink one to take the copy\n' +
        '  (rm <path>, then re-run), or leave it linked and edit the asset.\n',
    )
  }
  if (report.suggestions.length) {
    process.stdout.write('\nsuggestions:\n')
    for (const x of report.suggestions) process.stdout.write(`  - ${x}\n`)
  }
  if (report.warnings.length) {
    process.stdout.write('\nwarnings:\n')
    for (const w of report.warnings) process.stdout.write(`  ! ${w}\n`)
  }
  const declined = [
    ...report.customized.map((c) => [c, 'kept — this is what you declined']),
    ...report.adopted.map((c) => [c, 'kept — this is what was not installed']),
  ]
  if (diff) {
    for (const [c, why] of declined) {
      if (!c.hunks.length) continue
      process.stdout.write(`\n--- ${c.relPath} (${why})\n`)
      for (const h of c.hunks) process.stdout.write(`${h}\n`)
    }
  } else if (declined.length) {
    process.stdout.write('\nRe-run with --diff to see the changes those files declined.\n')
  }
  const isolationOn = fs.existsSync(path.join(dir, 'specs', '.core', 'env.config.json'))
  const isolationNote = isolationOn
    ? 'Per-spec isolation is ON: every in-progress spec gets its own git worktree' +
      ' at /spec-start.\n'
    : 'Per-spec isolation is opt-in: re-run with --isolation (or copy' +
      ' specs/.core/env.config.json.example → env.config.json) to enable it.\n'
  const gatingOn = fs.existsSync(path.join(dir, 'specs', '.core', 'gating.config.json'))
  const gatingNote = gatingOn
    ? 'Release gating is ON: /spec asks whether a change ships behind a feature' +
      ' flag and records the answer on the spec (skitterspec gating check reports' +
      ' any that have none).\n'
    : 'Release gating is opt-in: re-run with --gating (or copy' +
      ' specs/.core/gating.config.json.example → gating.config.json) to enable it.\n'
  // A provider superset ships its own `spec-<provider>-setup` skill; the base
  // ships none. Discovering it from what was actually installed keeps this file
  // tracker-free — it never has to know which tracker (if any) is in the box.
  const setupSkill = SKILLS.find((s) => /^spec-.+-setup$/.test(s))
  const provider = setupSkill ? /^spec-(.+)-setup$/.exec(setupSkill)[1] : null
  // …and the same derivation gives the provider's config filename, so this can
  // report tracker sync the way it reports isolation above — from what is
  // actually on disk. It used to say "opt-in: run /…-setup" even on a repo that
  // had already configured it, telling you to set up what was already set up.
  const trackerOn =
    provider && fs.existsSync(path.join(dir, 'specs', '.core', `${provider}.config.json`))
  const trackerNote = !setupSkill
    ? ''
    : trackerOn
      ? `Tracker sync is ON: ${provider} — the repo stays the source of truth;` +
        ' /spec-push mirrors a spec up and /spec-status reports drift.\n'
      : `Tracker sync is opt-in: run /${setupSkill} to configure it` +
        ' (it discovers your workspace and writes the config), or see' +
        ' specs/.core/SETUP.md.\n'
  process.stdout.write(
    '\nDone. Skills resolve as /spec, /spec-start, /spec-next, /spec-complete,' +
      ' /spec-bug, /spec-review, /spec-init, /spec-connect.\n' +
      'Next: tailor .claude/rules/spec-planning.md + the CLAUDE.md section to this' +
      " project's stack, then run /spec.\n" +
      isolationNote +
      gatingNote +
      trackerNote,
  )
}

// `mode` here is the INSTALL mode ('init' | 'update'), long-standing and
// unrelated to the config's own `mode` key — which arrives as `workspaceMode`
// precisely so the two cannot be confused at a call site.
/**
 * Suggest `hotfix.releaseWith` where skittership's hotfix release is installed
 * and nothing is configured yet. SUGGESTED, NEVER WRITTEN: it changes what a
 * hotfix land does — a version commit and the project's own tag scheme — and
 * that is the project's decision, not something an install makes for it.
 *
 * Silent unless both signals are present: the script on disk, and an
 * isolation config that leaves `releaseWith` empty. A config that cannot be
 * read is cannot-tell, and says nothing.
 */
function suggestReleaseWith(dir) {
  if (!fs.existsSync(path.join(dir, 'scripts', 'release-hotfix.cjs'))) return
  let loaded
  try {
    loaded = require('./env/config.js').loadEnvConfig(dir)
  } catch {
    return
  }
  if (!loaded || !loaded.present || loaded.config.hotfix.releaseWith) return
  report.suggestions.push(
    'scripts/release-hotfix.cjs is installed — to have hotfix land cut its release, set ' +
      '"hotfix": { "releaseWith": "node scripts/release-hotfix.cjs --json" } in ' +
      'specs/.core/env.config.json',
  )
}

// Decide this run's scope. A local manifest stays local whether or not the
// flag is passed — a later `update`, or an `init` without it, must not start
// writing hooks into the committed settings of a repo set up to keep them out.
// Switching a local install back to team is out of scope and says so.
function resolveScope(dir, local) {
  const recorded = readManifest(dir).scope
  const excluded = !local && recorded !== 'local' && excludeNamesManifest(dir)
  scope = local || recorded === 'local' || excluded ? 'local' : 'team'
  if (!local && recorded === 'local') report.skipped.push('local install (recorded in the manifest) — kept local')
  if (excluded) report.skipped.push('local install (recorded in .git/info/exclude) — kept local')
  if (local && recorded !== 'local') {
    report.warnings.push(
      '--local keeps skitterspec on this machine: teammates get none of its skills, rules ' +
        'or hooks. Use it where nobody else here uses skitterspec — never for a team that ' +
        'shares the hooks and rules as policy',
    )
  }
}

// The paths a local install keeps out of git: every managed file — the
// specs/.core templates included — the block's file, the per-machine settings,
// the manifest and the review store. Listed per PATH rather than per directory,
// so a teammate's own `.claude/skills/foo` is untouched, and so the LIVE configs
// beside the templates (env.config.json, <provider>.config.json,
// gating.config.json) stay visible: they are not managed, so never listed.
//
// The templates were once filtered out here, which left them out of both the
// exclude block and the worktree seeds while the manifest still managed them,
// and an `update` that changed one dirtied a tracked file
// (bug-local-install-templates).
//
// A skill is listed as its DIRECTORY (no trailing slash), because a worktree
// gets it seeded as one symlink — which git sees as a file at that path, and a
// `SKILL.md` entry would not match it.
function localManagedPaths(dir) {
  const paths = managedTargets(dir)
    .map((t) => t.relPath)
    .map((p) => (p.startsWith('.claude/skills/') ? path.posix.dirname(p) : p))
  return [...new Set(paths)]
}

function localExcludes(dir) {
  return [
    ...localManagedPaths(dir),
    CONVENTIONS_FILE.replace(/\\/g, '/'),
    'CLAUDE.local.md',
    '.claude/settings.local.json',
    MANIFEST_FILE.replace(/\\/g, '/'),
    '.spec-env/',
  ]
}

// What `spec-env bootstrap` seeds into a local install's worktrees: the managed
// paths, the two per-machine files and the manifest. A worktree is a fresh
// checkout, and git carries none of it there. Empty for a team install, which
// git carries.
//
// THE MANIFEST IS SEEDED because it is what records the scope: without it a
// worktree's `update` read team and wrote the block into the tracked CLAUDE.md
// and the hooks into a new .claude/settings.json (bug-local-scope-worktree).
//
// THE MANIFEST'S OWN RECORDS ARE SEEDED TOO (bug-local-seed-provider-skills).
// The skills call the base engine, whose asset list knows nothing of the
// provider that wrote this install — so a provider's /spec-push and the rest
// never reached a worktree. The manifest records every path the installing
// distribution manages, whichever package that was: a positive signal. An
// entry whose source has gone from the primary checkout costs nothing here —
// `runSeed` skips it and says so, never failing the bootstrap.
function localSeedFiles(dir) {
  const manifest = readManifest(dir)
  if (manifest.scope !== 'local') return []
  const recorded = Object.keys(manifest.files).map((p) =>
    p.startsWith('.claude/skills/') ? p.split('/').slice(0, 3).join('/') : p,
  )
  const managed = [...new Set([...localManagedPaths(dir), ...recorded])]
  return [...managed, CONVENTIONS_FILE.replace(/\\/g, '/'), '.claude/settings.local.json', 'CLAUDE.local.md', MANIFEST_FILE.replace(/\\/g, '/')]
}

const EXCLUDE_START = '# >>> skitterspec (local install)'
const EXCLUDE_END = '# <<< skitterspec'

// Write the managed block into `.git/info/exclude` — never `.gitignore`, which
// is itself a committed change. The common dir, so it covers every worktree.
// Entries carry the install folder's prefix when it sits below the git root.
// Not a git repo, or git unreachable: warn and write nothing.
function writeLocalExcludes(dir) {
  let commonDir, prefix
  try {
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    commonDir = path.resolve(dir, git('rev-parse', '--git-common-dir'))
    prefix = git('rev-parse', '--show-prefix')
  } catch {
    report.warnings.push('not a git repository — nothing excluded; the local install is not hidden from git')
    return
  }
  const file = path.join(commonDir, 'info', 'exclude')
  const lines = [...new Set(localExcludes(dir))].map((p) => `/${prefix}${p}`)
  const block = [EXCLUDE_START, ...lines, EXCLUDE_END].join('\n') + '\n'
  let existing = ''
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch {
    /* no exclude file yet */
  }
  const start = existing.indexOf(EXCLUDE_START)
  const end = existing.indexOf(EXCLUDE_END, start)
  const next =
    start !== -1 && end !== -1
      ? existing.slice(0, start) + block + existing.slice(end + EXCLUDE_END.length).replace(/^\n/, '')
      : existing + (existing && !existing.endsWith('\n') ? '\n' : '') + block
  if (next === existing) return report.skipped.push('.git/info/exclude (skitterspec block)')
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, next)
  report.updated.push('.git/info/exclude (skitterspec block)')
}

// Whether the shared `.git/info/exclude` block names THIS project's manifest —
// the positive signal that a worktree with no manifest of its own belongs to a
// local install. The exclude lives in the common dir, so every worktree sees
// the block the primary checkout's install wrote; matching the prefixed
// manifest path, not the bare block, keeps a second project in the same repo
// from being read as local by a neighbour's install.
//
// WHAT WOULD FOOL IT: a block hand-edited to drop the manifest line, or git
// unreachable. Both answer false — the scope the manifest recorded, as before.
function excludeNamesManifest(dir) {
  try {
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const commonDir = path.resolve(dir, git('rev-parse', '--git-common-dir'))
    const prefix = git('rev-parse', '--show-prefix')
    const text = fs.readFileSync(path.join(commonDir, 'info', 'exclude'), 'utf8')
    const start = text.indexOf(EXCLUDE_START)
    const end = text.indexOf(EXCLUDE_END, start)
    if (start === -1 || end === -1) return false
    const entry = `/${prefix}${MANIFEST_FILE.replace(/\\/g, '/')}`
    return text.slice(start, end).split(/\r?\n/).some((l) => l.trim() === entry)
  } catch {
    return false
  }
}

// Convert a COMMITTED (team) install into a local one, in place. Every step
// leaves the files on disk and stages or edits only; it never commits — the
// operator commits the removal, and teammates who pull it lose the install.
//
//   - managed paths git tracks → `git rm --cached` (staged, file kept)
//   - our hooks in settings.json → removed per hook; ensureHooks then adds
//     them to settings.local.json
//   - the CLAUDE.md section → moved ONLY when it carries the markers. A
//     markerless "Spec workflow" heading is someone's section, or an older
//     install's: reported, never bounded by guesswork
//   - a skitterspec dependency in package.json → reported, never edited
//
// Quiet on a repo with nothing committed: every step finds nothing.
function convertCommitted(dir) {
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const candidates = [...new Set(localExcludes(dir))].filter((p) => !p.endsWith('/'))
  let tracked
  try {
    tracked = git('ls-files', '--', ...candidates).split('\n').filter(Boolean)
  } catch {
    return // not a git repo — writeLocalExcludes says so
  }
  // A TRACKED specs/.core TEMPLATE IS REPORTED, NEVER UNTRACKED. specs/ is the
  // part of a local install git carries, and a template sitting in it may be
  // there on purpose — this cannot tell, so it names the command and leaves
  // the index alone. Untracked, the exclude block hides it from then on.
  const isTemplate = (p) => p.startsWith('specs/') && p !== MANIFEST_FILE.replace(/\\/g, '/')
  const templates = tracked.filter(isTemplate)
  if (templates.length) {
    tracked = tracked.filter((p) => !templates.includes(p))
    report.warnings.push(
      `${templates.length} managed specs/.core template(s) still tracked by git, so an update that ` +
        'changes one dirties git. To keep them on disk and out of git, run here and commit: ' +
        `git rm --cached -- ${templates.join(' ')}`,
    )
  }
  let staged = tracked.length > 0
  if (tracked.length) {
    git('rm', '--cached', '-q', '--', ...tracked)
    report.updated.push(`git index (${tracked.length} managed file(s) untracked — kept on disk)`)
  }

  const hooks = removeHooks(dir)
  if (hooks.reason === 'malformed') {
    report.warnings.push('.claude/settings.json is not valid JSON — skitterspec hooks left in it; remove them by hand')
  } else if (hooks.reason === 'removed') {
    if (hooks.emptied) {
      fs.unlinkSync(path.join(dir, '.claude', 'settings.json'))
      // Stage the deletion too, so the conversion is one thing to commit.
      try {
        git('rm', '--cached', '-q', '--ignore-unmatch', '--', '.claude/settings.json')
      } catch {
        /* untracked settings — nothing to stage */
      }
      report.removed.push('.claude/settings.json (held only skitterspec hooks)')
    } else report.updated.push(`.claude/settings.json (${hooks.removed} skitterspec hook(s) moved to settings.local.json)`)
    staged = true
  }

  const claude = path.join(dir, 'CLAUDE.md')
  if (fs.existsSync(claude)) {
    const text = fs.readFileSync(claude, 'utf8')
    if (text.includes(SPEC_MARKER_START) && text.includes(SPEC_MARKER_END)) {
      const re = new RegExp(`\\n*${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`)
      fs.writeFileSync(claude, text.replace(re, '\n'))
      report.updated.push('CLAUDE.md (spec workflow section moved to CLAUDE.local.md)')
      staged = true
    } else {
      const line = text.split('\n').findIndex((l) => /^##\s+Spec workflow/.test(l))
      if (line !== -1) {
        report.warnings.push(
          `CLAUDE.md:${line + 1} has a "Spec workflow" section with no skitterspec markers, so it was ` +
            'not moved — move it to CLAUDE.local.md by hand if it is the skitterspec block',
        )
      }
    }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const ours = Object.keys(deps).filter((n) => n.startsWith('@skitterbyte/skitterspec'))
    for (const name of ours) {
      report.suggestions.push(
        `package.json lists ${name} — left as it is. To keep it out of the repo too, ` +
          `remove it and install it globally (npm i -g ${name}), then re-run \`skitterspec update\``,
      )
    }
  } catch {
    /* no package.json, or unreadable — nothing to say */
  }

  if (staged) {
    report.suggestions.push(
      'the conversion is staged, not committed — commit it (/commit) and teammates who pull it lose the install',
    )
  }

  // The templates are left out here for the reason they are never untracked
  // above: on a branch they may be committed on purpose, so they are not what
  // "still commits the install" means.
  for (const row of branchesCarryingInstall(dir, candidates.filter((p) => !isTemplate(p)))) {
    if (row.cannotTell) {
      report.warnings.push(`${row.ref}: cannot tell whether it still commits the install — git could not read it`)
      continue
    }
    const what = [`${row.files} managed file(s)`, ...(row.hooks ? [`${row.hooks} hook(s)`] : [])].join(', ')
    report.suggestions.push(
      `${row.ref} still commits the install (${what})${row.remote ? ' — as of the last fetch' : ''}. ` +
        'Anyone working from it still gets the skills: merge this conversion into it, or run ' +
        '`skitterspec init --local` on it and commit',
    )
  }
}

// The long-lived branches — the base, `hotfix.releaseBranch`, the remote's
// default — that still commit the install this conversion takes out of git.
// A conversion is per branch, so a quarter branch converted and a `master` left
// as it was still hands every teammate on `master` the whole workflow.
// Feature branches are not asked: they catch up when they merge the base.
//
// Each name is read as its remote-tracking ref where one exists (what
// teammates pull), else as the local branch. The branch being converted is
// skipped — its own state is the staged conversion above.
//
// WHAT WOULD FOOL THIS: remote-tracking refs are as of the last fetch, and this
// never fetches. A branch cleaned on the remote since then is still reported
// (and says "as of the last fetch"); one that regained the install is missed.
// A base that does not resolve (the gap between release branches) is not a
// candidate at all, so it is skipped rather than reported clean.
function branchesCarryingInstall(dir, candidates) {
  const read = (args) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return null
    }
  }
  let config = null
  try {
    config = require('./env/config.js').loadEnvConfig(dir).config
  } catch {
    /* unreadable config — the base still resolves from git alone */
  }
  const remote = baseRemote(config)
  const names = []
  try {
    const { base } = describeBaseBranch(config, read)
    if (base) names.push(base)
  } catch {
    /* cannot tell — no candidate */
  }
  const release = config && config.hotfix && typeof config.hotfix.releaseBranch === 'string' && config.hotfix.releaseBranch.trim()
  if (release) names.push(release)
  const head = read(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`])
  if (head) names.push(head.startsWith(`${remote}/`) ? head.slice(remote.length + 1) : head)

  const current = read(['symbolic-ref', '--short', 'HEAD'])
  const rows = []
  for (const name of new Set(names)) {
    if (name === current) continue
    const exists = (ref) => read(['show-ref', '--verify', '--quiet', ref]) !== null
    const ref = exists(`refs/remotes/${remote}/${name}`) ? `${remote}/${name}` : exists(`refs/heads/${name}`) ? name : null
    if (!ref) continue
    const listed = read(['ls-tree', '-r', '--name-only', ref, '--', ...candidates])
    if (listed === null) {
      rows.push({ ref, cannotTell: true })
      continue
    }
    const files = listed.split('\n').filter(Boolean).length
    const hooks = hooksAt(read, ref)
    if (hooks === null) {
      rows.push({ ref, cannotTell: true })
      continue
    }
    if (files || hooks) rows.push({ ref, files, hooks, remote: ref !== name })
  }
  return rows
}

// Our hook entries in a ref's committed `.claude/settings.json` — 0 when it has
// none or no such file, null when the file is there and not JSON.
function hooksAt(read, ref) {
  const text = read(['show', `${ref}:./.claude/settings.json`])
  if (text === null) return 0
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const pre = parsed && parsed.hooks && Array.isArray(parsed.hooks.PreToolUse) ? parsed.hooks.PreToolUse : []
  return pre
    .flatMap((group) => (group && Array.isArray(group.hooks) ? group.hooks : []))
    .filter((h) => h && typeof h.command === 'string' && GATE_HOOKS.some((k) => k.re.test(h.command))).length
}

// DISABLE / ENABLE — switch whether this machine's Claude uses a local install,
// without touching its files (feat-uninstall-local). Claude Code has no single
// switch covering skills, commands, rules and hooks, so the install is switched
// through three settings in `.claude/settings.local.json`:
//   - `skillOverrides: { <name>: "off" }` — every managed skill and command
//     (command files are skills to Claude Code). Exact names: no wildcard.
//   - `claudeMdExcludes: ["**/.claude/rules/<file>"]` — every managed rule, as
//     a glob so the one entry matches in every worktree.
//   - our hooks and the CLAUDE.local.md block are taken out, and written back
//     from the shipped assets by `enable`, so nothing has to be saved.
// Only entries naming OUR paths are written or removed: an override or exclude
// the developer wrote is never taken.
function switchNames() {
  return [...SKILLS, ...COMMANDS.map((c) => c.replace(/\.md$/, ''))]
}

// The conventions file is switched with the rules: it is not managed, but a
// disabled install should not go on loading half of itself.
function ruleExcludes() {
  return [...RULES, path.basename(CONVENTIONS_FILE)].map((r) => `**/.claude/rules/${r}`)
}

// The local settings, parsed — `{}` when absent, null when not valid JSON.
function readLocalSettings(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (error) {
    return error.code === 'ENOENT' ? {} : null
  }
}

function writeLocalSettings(dir, settings) {
  const file = path.join(dir, '.claude', 'settings.local.json')
  if (!Object.keys(settings).length) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return
  }
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n')
}

// Take our override and exclude entries out of the local settings. Returns
// false when the file is not valid JSON (left untouched).
function clearSwitches(dir) {
  const settings = readLocalSettings(dir)
  if (settings === null) return false
  const names = new Set(switchNames())
  const globs = new Set(ruleExcludes())
  if (settings.skillOverrides && typeof settings.skillOverrides === 'object') {
    for (const name of Object.keys(settings.skillOverrides)) {
      if (names.has(name) && settings.skillOverrides[name] === 'off') delete settings.skillOverrides[name]
    }
    if (!Object.keys(settings.skillOverrides).length) delete settings.skillOverrides
  }
  if (Array.isArray(settings.claudeMdExcludes)) {
    settings.claudeMdExcludes = settings.claudeMdExcludes.filter((g) => !globs.has(g))
    if (!settings.claudeMdExcludes.length) delete settings.claudeMdExcludes
  }
  writeLocalSettings(dir, settings)
  return true
}

function stripLocalClaudeBlock(dir) {
  const file = path.join(dir, 'CLAUDE.local.md')
  if (!fs.existsSync(file)) return false
  const text = fs.readFileSync(file, 'utf8')
  const re = new RegExp(`\\n*${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`)
  if (!re.test(text)) return false
  const next = text.replace(re, '\n')
  if (next.trim()) fs.writeFileSync(file, next.replace(/^\n+/, ''))
  else fs.unlinkSync(file)
  return true
}

function rewriteManifestEnabled(dir, enabled) {
  const manifest = readManifest(dir)
  writeManifest(dir, manifest.files, { local: manifest.scope === 'local', enabled })
}

// Turn a local install off for this machine's Claude. Deletes nothing, so it
// refuses nothing about work in flight; returns the exit code.
function disable(dir, { log = (s) => process.stdout.write(s) } = {}) {
  if (!fs.existsSync(path.join(dir, MANIFEST_FILE))) {
    log('disable: no skitterspec install here (no manifest) — nothing to disable.\n')
    return 0
  }
  const manifest = readManifest(dir)
  if (manifest.scope !== 'local') {
    log(
      'disable: refused — this is a team install. Its hooks are in the committed settings,\n' +
        '  so they cannot be switched off for one person. disable works on a local install (init --local).\n',
    )
    return 1
  }
  const settings = readLocalSettings(dir)
  if (settings === null) {
    log('disable: refused — .claude/settings.local.json is not valid JSON, and the switch is written there. Nothing changed.\n')
    return 1
  }
  const overrides = settings.skillOverrides && typeof settings.skillOverrides === 'object' ? settings.skillOverrides : {}
  for (const name of switchNames()) overrides[name] = 'off'
  settings.skillOverrides = overrides
  const excludes = Array.isArray(settings.claudeMdExcludes) ? settings.claudeMdExcludes : []
  for (const glob of ruleExcludes()) if (!excludes.includes(glob)) excludes.push(glob)
  settings.claudeMdExcludes = excludes
  writeLocalSettings(dir, settings)
  const hooks = removeHooks(dir, { local: true })
  if (hooks.emptied) writeLocalSettings(dir, {})
  const block = stripLocalClaudeBlock(dir)
  rewriteManifestEnabled(dir, false)
  log(
    `disable: skitterspec is off for Claude on this machine (${dir})\n` +
      `  ${switchNames().length} skills and commands switched off · ${RULES.length} rules excluded\n` +
      `  ${hooks.removed} hook(s) removed${block ? ' · CLAUDE.local.md block removed' : ''}\n` +
      '  the files stay on disk — skitterspec enable turns it back on. Restart Claude Code to pick it up.\n',
  )
  return 0
}

// Turn a local install back on — and install it when there is nothing here to
// turn on, since asking to use it has one meaning then.
async function enable(dir, { log = (s) => process.stdout.write(s) } = {}) {
  const manifest = readManifest(dir)
  const present = fs.existsSync(path.join(dir, MANIFEST_FILE))
  const filesHere = managedTargets(dir).some((t) => !t.relPath.startsWith('specs') && fs.existsSync(t.abs))
  if (!present || (manifest.scope === 'local' && !filesHere)) {
    log('enable: no local install here — installing it (init --local).\n')
    // `update` mode installs the files and switches them on, and leaves the
    // project's committed config (isolation, gating) exactly as it is.
    await init({ dir, force: false, claudeMd: true, mode: 'update', local: true })
    return 0
  }
  if (manifest.scope !== 'local') {
    log('enable: refused — this is a team install, which is always on. enable works on a local install (init --local).\n')
    return 1
  }
  if (!clearSwitches(dir)) {
    log('enable: refused — .claude/settings.local.json is not valid JSON, and the switch is written there. Nothing changed.\n')
    return 1
  }
  resetReport()
  scope = 'local'
  registerReviewGateHook(dir)
  installClaudeMd(dir, { mode: 'init' })
  rewriteManifestEnabled(dir, true)
  log(
    `enable: skitterspec is on for Claude on this machine (${dir})\n` +
      '  skills, commands and rules switched back on · hooks registered · CLAUDE.local.md block written\n' +
      '  Restart Claude Code to pick it up.\n',
  )
  return 0
}

// UNINSTALL — take a local install (`init --local`) back off this machine,
// exactly: the managed files, our hooks in settings.local.json, the block in
// CLAUDE.local.md, the exclude block, `.spec-env/` and the manifest. Nothing
// under `specs/` is touched — it is committed and shared. Plans by default and
// acts only with `yes`; returns the exit code.
//
// A file is deleted only when it is PRISTINE. An unrecognised hash is either
// the developer's edit or a lost record, and only one of those is safe to
// delete, so it is kept (`.claude/rules/negative-checks.md` rule 4) — but kept
// under `.claude/` it would still be loaded, so it is PARKED in
// `<git-common-dir>/skitterspec-kept/`: outside the tree, so git status is
// unchanged, and never over an earlier parked copy.
//
// `inFlight` is the caller's list of provisioned specs and a held live overlay;
// any entry refuses, because each worktree carries a seeded copy of the install
// and a torn-down primary leaves nothing to finish them with. `cannotTell` is
// the caller failing to read that list, which also refuses: deleting is the
// destructive branch, so the unknown case does not get it.
function uninstall(dir, { yes = false, inFlight = [], cannotTell = null, log = (s) => process.stdout.write(s) } = {}) {
  const manifestAbs = path.join(dir, MANIFEST_FILE)
  if (!fs.existsSync(manifestAbs)) {
    log('uninstall: no skitterspec install here (no manifest) — nothing to do.\n')
    return 0
  }
  const manifest = readManifest(dir)
  if (manifest.scope !== 'local') {
    log(
      'uninstall: refused — this is a team install, committed for everyone.\n' +
        '  Removing it is a commit for the team to make, not one machine\'s command.\n' +
        '  uninstall only takes a local install (init --local) back off.\n',
    )
    return 1
  }
  if (cannotTell) {
    log(`uninstall: refused — cannot tell whether a spec is in flight (${cannotTell}).\n  Nothing changed.\n`)
    return 1
  }
  if (inFlight.length) {
    log(
      'uninstall: refused — work is still in flight here, and its worktrees carry a copy of the install:\n' +
        inFlight.map((f) => `  ${f.spec}  ${f.where}\n`).join('') +
        '  Finish each with /spec-complete, drop it with /spec-cancel (or spec-env down <name>),\n' +
        '  and hand a live spec back with /spec-live off. Nothing changed.\n',
    )
    return 1
  }

  // The files: every managed target, plus any manifest entry
  // the package no longer ships (a retired skill is still a skill on disk).
  const targets = new Map()
  for (const t of managedTargets(dir)) targets.set(t.relPath.split(path.sep).join('/'), t.bundled)
  for (const k of Object.keys(manifest.files)) if (!targets.has(k)) targets.set(k, undefined)
  // The conventions file is not managed, but a local install wrote it: the
  // untouched template goes, and a filled-in one is parked like an edit.
  targets.set(CONVENTIONS_FILE.split(path.sep).join('/'), fs.readFileSync(path.join(ASSETS, 'project-conventions.md'), 'utf8'))
  const remove = []
  const keep = []
  const exclude = localExcludeFile(dir)
  const parkRoot = exclude && path.join(path.dirname(path.dirname(exclude.file)), 'skitterspec-kept')
  const parkFor = (relPath) => {
    let target = path.join(parkRoot, relPath)
    for (let n = 2; fs.existsSync(target); n++) target = path.join(parkRoot, `${relPath}.${n}`)
    return target
  }
  // The specs/.core templates are excluded like every managed file, so they go
  // with the rest — but only those git does not track. A tracked one is the
  // repo's (a team-era commit, or one kept on purpose) and stays. Git
  // unreachable is cannot-tell, and keeps every template.
  let untrackedTemplates = new Set()
  try {
    const templates = [...targets.keys()].filter((p) => p.startsWith('specs/.core/'))
    const tracked = templates.length
      ? execFileSync('git', ['-C', dir, 'ls-files', '--', ...templates], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
          .split('\n')
          .filter(Boolean)
      : []
    untrackedTemplates = new Set(templates.filter((p) => !tracked.includes(p)))
  } catch {
    /* not a git repo — keep the templates */
  }
  for (const [relPath, bundled] of [...targets].sort(([a], [b]) => a.localeCompare(b))) {
    if (relPath.startsWith('specs/') && !untrackedTemplates.has(relPath)) continue
    const state = managedState(dir, relPath, manifest, bundled)
    if (state === 'pristine') remove.push(relPath)
    else if (state !== 'missing') keep.push({ relPath, parked: parkRoot ? parkFor(relPath) : null })
  }

  const hooks = removeHooks(dir, { local: true, dryRun: true })
  const switches = readLocalSettings(dir)
  const hasSwitches =
    switches !== null &&
    (Object.keys(switches.skillOverrides || {}).some((n) => switchNames().includes(n)) ||
      (Array.isArray(switches.claudeMdExcludes) && switches.claudeMdExcludes.some((g) => ruleExcludes().includes(g))))
  const claudeLocal = path.join(dir, 'CLAUDE.local.md')
  const blockRe = new RegExp(`\\n*${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`)
  const claudeText = fs.existsSync(claudeLocal) ? fs.readFileSync(claudeLocal, 'utf8') : null
  const hasBlock = claudeText !== null && blockRe.test(claudeText)
  const hasExclude = exclude !== null && exclude.text.includes(EXCLUDE_START)
  const specEnv = path.join(dir, '.spec-env')

  const lines = []
  const say = (label, items) => {
    if (!items.length) return
    lines.push(`\n${label}:\n`)
    for (const it of items) lines.push(`  ${it}\n`)
  }
  say(yes ? 'removed' : 'would remove', [
    ...remove,
    ...(hooks.reason === 'removed' ? [`.claude/settings.local.json (${hooks.removed} skitterspec hook(s)${hooks.emptied ? ', then the emptied file' : ''})`] : []),
    ...(hasSwitches ? ['.claude/settings.local.json (skitterspec disable switches)'] : []),
    ...(hasBlock ? ['CLAUDE.local.md (spec workflow block)'] : []),
    ...(hasExclude ? [`${path.relative(dir, exclude.file).split(path.sep).join('/')} (skitterspec block)`] : []),
    ...(fs.existsSync(specEnv) ? ['.spec-env/'] : []),
    MANIFEST_FILE.split(path.sep).join('/'),
  ])
  say(
    yes ? 'parked — edited since install, moved out of Claude\'s reach' : 'would park — edited since install',
    keep.map((k) => (k.parked ? `${k.relPath} → ${k.parked}` : `${k.relPath} (kept in place — no git dir to park it in)`)),
  )
  const warnings = []
  if (hooks.reason === 'malformed') warnings.push('.claude/settings.local.json is not valid JSON — skitterspec hooks left in it; remove them by hand')
  if (exclude === null) warnings.push('not a git repository — no exclude block to remove')
  say('warnings', warnings)

  if (!yes) {
    log(`uninstall: plan — nothing changed (${dir})\n${lines.join('')}\n  re-run with --yes to remove the local install.\n`)
    return 0
  }

  const managedSet = new Set(targets.keys())
  const parents = new Set()
  for (const relPath of remove) {
    assertSafeToDelete(relPath, managedSet)
    fs.unlinkSync(path.join(dir, relPath))
    parents.add(path.dirname(path.join(dir, relPath)))
  }
  for (const k of keep) {
    if (!k.parked) continue
    fs.mkdirSync(path.dirname(k.parked), { recursive: true })
    try {
      fs.renameSync(path.join(dir, k.relPath), k.parked)
    } catch (error) {
      if (error.code !== 'EXDEV') throw error
      fs.copyFileSync(path.join(dir, k.relPath), k.parked)
      fs.unlinkSync(path.join(dir, k.relPath))
    }
    parents.add(path.dirname(path.join(dir, k.relPath)))
  }
  // Folders our files left empty — a skill's own, then .claude/<kind>/ — and
  // never one that still holds something of the developer's.
  const stop = path.join(dir, '.claude')
  for (const start of parents) {
    for (let at = start; at.startsWith(stop + path.sep); at = path.dirname(at)) {
      try {
        if (fs.readdirSync(at).length) break
        fs.rmdirSync(at)
      } catch {
        break
      }
    }
  }
  // A disabled install's switches go too, or they would outlive what they name.
  clearSwitches(dir)
  if (hooks.reason === 'removed') {
    const done = removeHooks(dir, { local: true })
    if (done.emptied) fs.unlinkSync(path.join(dir, '.claude', 'settings.local.json'))
  }
  if (hasBlock) {
    const next = claudeText.replace(blockRe, '\n')
    if (next.trim()) fs.writeFileSync(claudeLocal, next.replace(/^\n+/, ''))
    else fs.unlinkSync(claudeLocal)
  }
  if (hasExclude) {
    const start = exclude.text.indexOf(EXCLUDE_START)
    const end = exclude.text.indexOf(EXCLUDE_END, start)
    if (end !== -1) {
      fs.writeFileSync(exclude.file, exclude.text.slice(0, start) + exclude.text.slice(end + EXCLUDE_END.length).replace(/^\n/, ''))
    }
  }
  fs.rmSync(specEnv, { recursive: true, force: true })
  fs.unlinkSync(manifestAbs)

  log(
    `uninstall: done (${dir})\n${lines.join('')}\n` +
      `  the CLI itself is still installed — npm uninstall -g ${distributionPackage()} removes it.\n`,
  )
  return 0
}

// The git common dir's info/exclude, read — null when this is not a git repo.
function localExcludeFile(dir) {
  let commonDir
  try {
    commonDir = path.resolve(
      dir,
      execFileSync('git', ['-C', dir, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
    )
  } catch {
    return null
  }
  const file = path.join(commonDir, 'info', 'exclude')
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    /* no exclude file */
  }
  return { file, text }
}

async function init({ dir, force, claudeMd, mode, isolation, workspaceMode, gating, project, local = false }) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  resetReport()
  resolveScope(dir, local)
  if (scope === 'local') convertCommitted(dir)
  // Installing is enabling: a disabled install comes back on.
  if (scope === 'local' && !readManifest(dir).enabled) {
    clearSwitches(dir)
    report.updated.push('.claude/settings.local.json (skitterspec enabled)')
  }
  enabledOnFlush = true

  installSkills(dir, { force })
  installCommands(dir, { force })
  installRule(dir, { force })
  installConventions(dir)
  installHooks(dir, { force })
  installFolders(dir)
  removeRetiredFiles(dir)
  installCore(dir, { force })
  // Adopting isolation writes the live env.config.json — init only, never update.
  if (mode !== 'update') installIsolation(dir, { enabled: isolation, workspaceMode, project }, { force })
  if (mode !== 'update') installGating(dir, { enabled: gating }, { force })
  if (claudeMd) installClaudeMd(dir, { mode })
  suggestReleaseWith(dir)

  // Record what we wrote (and migrate a pre-manifest repo) so a later resync can
  // tell our files from the user's.
  flushManifest(dir)
  if (scope === 'local') writeLocalExcludes(dir)

  printReport(dir, mode)
}

module.exports = {
  init,
  // A snapshot of the last run's report, for tests that need to assert on what a
  // run DECIDED rather than only on what it left on disk. Copied, so a caller
  // cannot mutate the live report between phases of a run.
  lastReport: () => JSON.parse(JSON.stringify(report)),
  SKILLS,
  COMMANDS,
  RULES,
  SPEC_FOLDERS,
  MANIFEST_FILE,
  sha1,
  readManifest,
  writeManifest,
  managedTargets,
  managedState,
  alwaysLoaded,
  CONVENTIONS_FILE,
  listSkillFiles,
  claudeMdSectionState,
  checkSync,
  isExistingSetup,
  resync,
  reset,
  uninstall,
  disable,
  enable,
  assertSafeToDelete,
  assertComposedAssets,
  detectPackageManager,
  detectRunner,
  renderCommand,
  hasPathInstall,
  packageForBin,
  renderExec,
  distributionPackage,
  localExcludes,
  localSeedFiles,
  EXCLUDE_START,
  EXCLUDE_END,
}
