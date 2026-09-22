'use strict'

/**
 * Build the self-contained, publishable distributions from the private workspace
 * packages.
 *
 *   skitterspec         (base)     = compose `common`'s assets with seams emptied,
 *                                    plus `common`'s bin + src verbatim.
 *   skitterspec-linear  (superset) = compose `common`'s assets with the Linear
 *                                    seam fragments filled, overlay the Linear
 *                                    skills + config templates, and vendor the JS
 *                                    of `common` + `sync-core` + the Linear adapter
 *                                    into one tree.
 *
 * "Self-contained" is the crux of publish correctness: a published distribution
 * must have NO runtime dependency on the private `common`/`sync-core`/`linear`
 * workspace packages. So the vendored JS has its bare `@skitterbyte/skitterspec-*`
 * requires rewritten to relative paths, and a guard fails the build if any bare
 * workspace specifier survives.
 *
 * Deterministic and idempotent: a clean rebuild of the output dirs every time,
 * pure file transforms, no timestamps. Zero dependencies.
 */

const fs = require('node:fs')
const path = require('node:path')

const { composeAssets, loadFragments, mergeFragments } = require('./compose.js')

const ROOT = path.join(__dirname, '..')
const PKGS = path.join(ROOT, 'packages')

// The output subdirs each build regenerates (everything else in a distribution
// package — package.json, README — is committed and left untouched).
const BUILT_DIRS = ['assets', 'bin', 'src']

// Common's own seam fragments — text shared by several of ITS OWN skills, filled
// into every distribution (the base included, where provider seams stay empty).
//
// They live at `packages/common/seams/`, deliberately OUTSIDE `assets/`: a build
// copies common's whole assets tree into the distribution, so a fragment stored
// under `assets/` would be published as though it were an installable asset. A
// provider's seams (`packages/linear/assets/seams/`) can sit under assets/
// because only named subtrees of a provider are ever overlaid.
const commonSeams = () => loadFragments(path.join(PKGS, 'common', 'seams'))

// The upgrade guide is written once at the repo root and COPIED into each
// distribution, because it has to reach users: it documents both the base's
// v1→v2/v2→v3 moves and the Linear provider's v8→v9 remap, and a guide that
// isn't in the published tarball may as well not exist (it wasn't, and a field
// report read as "no migration path" as a result).
function copyMigrationGuide(out) {
  copyFile(path.join(ROOT, 'MIGRATION.md'), path.join(out, 'MIGRATION.md'))
}

// Where each vendored workspace package lands inside a superset's `src/`, and thus
// how its bare specifier is rewritten. `common/src` flattens to the src root; the
// engine and adapter live under `vendor/` to avoid a `config.js` name clash.
const VENDOR = [
  { from: '@skitterbyte/skitterspec-common/src', to: (srcRoot) => srcRoot },
  { from: '@skitterbyte/skitterspec-sync-core', to: (srcRoot) => path.join(srcRoot, 'vendor', 'sync-core') },
  { from: '@skitterbyte/skitterspec-provider-linear/src', to: (srcRoot) => path.join(srcRoot, 'vendor', 'linear') },
]

// Any bare `@skitterbyte/skitterspec-*` require — the set the guard forbids in
// built output and the rewriter resolves.
const WORKSPACE_REQUIRE_RE = /require\((['"])(@skitterbyte\/skitterspec-[^'"]+)\1\)/g

// Rewrite a vendored file's workspace requires to relative paths against `srcRoot`.
function rewriteRequires(code, fileAbs, srcRoot) {
  return code.replace(WORKSPACE_REQUIRE_RE, (whole, q, spec) => {
    const v = VENDOR.find((e) => spec === e.from || spec.startsWith(e.from + '/'))
    if (!v) return whole // unknown → left for the guard to catch
    const sub = spec.slice(v.from.length).replace(/^\//, '')
    const target = path.join(v.to(srcRoot), sub)
    let relp = path.relative(path.dirname(fileAbs), target)
    if (!relp.startsWith('.')) relp = `./${relp}`
    return `require(${q}${relp}${q})`
  })
}

function rmDir(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

// Copy a file, rewriting workspace requires in `.js` when `srcRoot` is given.
//
// Both branches must reproduce the source's MODE, not just its bytes.
// `copyFileSync` carries the mode for free; `writeFileSync` creates the file at
// the default 0644 and silently drops the executable bit. That matters for
// exactly one file — a composed `bin/` entry — and only for `link:` consumers,
// because npm sets the exec bit on `bin` entries when it packs a tarball. So a
// published install is fine and a linked one fails EACCES on a command that
// plainly exists. `dev:link` is the whole path this hits.
function copyFile(src, dst, srcRoot) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  if (srcRoot && src.endsWith('.js')) {
    fs.writeFileSync(dst, rewriteRequires(fs.readFileSync(src, 'utf8'), dst, srcRoot))
    fs.chmodSync(dst, fs.statSync(src).mode & 0o777)
  } else {
    fs.copyFileSync(src, dst)
  }
}

// Recursively copy `srcDir` → `dstDir`. With `srcRoot`, `.js` files have their
// workspace requires rewritten (the require target is computed from the file's
// DESTINATION path, so pass the same `srcRoot` used to place the tree).
function copyTree(srcDir, dstDir, srcRoot) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name)
    const dst = path.join(dstDir, entry.name)
    if (entry.isDirectory()) copyTree(src, dst, srcRoot)
    else copyFile(src, dst, srcRoot)
  }
}

// Overlay `srcDir` onto an existing `dstDir` (provider files added/over base).
// Overlay a provider's own assets onto the composed tree. `.md` files are put
// through the same seam substitution as common's, so a provider skill can reuse
// a fragment (e.g. the project picker, shared by /spec and /spec-push) instead of
// keeping a second copy of it — and can never ship a raw marker.
// A provider need not ship every asset kind (it may have skills but no commands),
// so a missing source tree is a clean no-op rather than a build failure.
function overlayTree(srcDir, dstDir, fragments = {}) {
  if (!fs.existsSync(srcDir)) return
  composeAssets(srcDir, dstDir, fragments)
}

/**
 * Merge a provider's per-spec-isolation defaults into the composed
 * `env.config.json.example` a distribution ships.
 *
 * MERGED, NEVER REPLACED, and that is the whole shape of it. The example is
 * copied verbatim into a new project by `init --isolation`, so a provider that
 * shipped its own copy of the file would silently pin every fresh install to
 * whatever the base's example looked like on the day that copy was taken. Here
 * the provider states only the keys it needs and inherits the rest forever.
 *
 * Section-deep is deliberately as deep as it goes: these are `{ branch: {...},
 * spec: {...} }` shaped, and a general deep merge over arrays would have to
 * decide whether a provider's `companionPaths` appends to the base's or
 * replaces it — a question with no right answer and no test to catch the wrong
 * one. The base ships every such array empty, so the question does not arise.
 *
 * A provider declaring nothing is a clean no-op, which is what the base build
 * relies on.
 */
function mergeConfigDefaults(examplePath, provided) {
  if (!provided || !Object.keys(provided).length) return
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'))
  for (const [section, keys] of Object.entries(provided)) {
    example[section] = { ...(example[section] || {}), ...keys }
  }
  fs.writeFileSync(examplePath, `${JSON.stringify(example, null, 2)}\n`)
}

// Fail the build if any built `.js` still carries a bare workspace require —
// that would make the published package depend on an unpublished private one.
function guardNoWorkspaceRequires(dir) {
  const offenders = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.js')) {
        const hits = [...fs.readFileSync(p, 'utf8').matchAll(WORKSPACE_REQUIRE_RE)].map((m) => m[2])
        for (const spec of hits) offenders.push(`${path.relative(ROOT, p)} → ${spec}`)
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  if (offenders.length) {
    throw new Error(`build-dist: unresolved workspace requires in built output:\n  ${offenders.join('\n  ')}`)
  }
}

// --- distributions ----------------------------------------------------------

function buildBase() {
  const out = path.join(PKGS, 'skitterspec')
  const common = path.join(PKGS, 'common')
  for (const d of BUILT_DIRS) rmDir(path.join(out, d))

  // Assets: compose common with its own shared fragments filled and every
  // PROVIDER seam emptied (there is no provider in the base distribution).
  composeAssets(path.join(common, 'assets'), path.join(out, 'assets'), commonSeams())
  // bin + src: common is already self-contained (only `prompts` + relative requires).
  copyTree(path.join(common, 'src'), path.join(out, 'src'))
  copyTree(path.join(common, 'bin'), path.join(out, 'bin'))

  copyMigrationGuide(out)
  guardNoWorkspaceRequires(path.join(out, 'src'))
  guardNoWorkspaceRequires(path.join(out, 'bin'))
  return out
}

function buildLinear() {
  const out = path.join(PKGS, 'skitterspec-linear')
  const common = path.join(PKGS, 'common')
  const linear = path.join(PKGS, 'linear')
  const syncCore = path.join(PKGS, 'sync-core')
  const srcRoot = path.join(out, 'src')
  for (const d of BUILT_DIRS) rmDir(path.join(out, d))

  // Assets: compose common with the Linear fragments filled, then overlay the
  // Linear-only skills, rules and linear.config templates.
  //
  // `rules` is overlaid for the same reason as `skills`: a provider rule is
  // tracker-specific, so it must reach the superset and NOT the tracker-free
  // base. `listRules` (common/src/init.js) then discovers it and installs it to
  // `.claude/rules/`, where it is loaded as a project instruction.
  const fragments = mergeFragments(commonSeams(), loadFragments(path.join(linear, 'assets', 'seams')))
  composeAssets(path.join(common, 'assets'), path.join(out, 'assets'), fragments)
  overlayTree(path.join(linear, 'assets', 'skills'), path.join(out, 'assets', 'skills'), fragments)
  // Commands are overlaid for the same reason as skills: a provider may ship its
  // own `.claude/commands/` entries. `composeAssets` already copies common's
  // whole assets tree, so the base distribution needs nothing here.
  overlayTree(path.join(linear, 'assets', 'commands'), path.join(out, 'assets', 'commands'), fragments)
  overlayTree(path.join(linear, 'assets', 'rules'), path.join(out, 'assets', 'rules'), fragments)
  overlayTree(path.join(linear, 'assets', 'core'), path.join(out, 'assets', 'core'), fragments)
  // The two isolation keys the provider's own snapshot needs declared. They are
  // read from the adapter rather than restated here, so the companion pattern
  // cannot drift from `sync.baseDir` — the one place the snapshot directory is
  // decided. `ENV_CONFIG_DEFAULTS` carries why the base cannot ship them.
  mergeConfigDefaults(
    path.join(out, 'assets', 'core', 'env.config.json.example'),
    require(path.join(linear, 'src', 'config.js')).ENV_CONFIG_DEFAULTS,
  )

  // src: common at the root; the engine + adapter vendored under vendor/. All JS
  // has its workspace requires rewritten relative to srcRoot.
  copyTree(path.join(common, 'src'), srcRoot, srcRoot)
  copyFile(path.join(syncCore, 'index.js'), path.join(srcRoot, 'vendor', 'sync-core', 'index.js'), srcRoot)
  copyTree(path.join(syncCore, 'src'), path.join(srcRoot, 'vendor', 'sync-core', 'src'), srcRoot)
  copyTree(path.join(linear, 'src'), path.join(srcRoot, 'vendor', 'linear'), srcRoot)
  // bin: the superset entry point (delegates to the vendored base CLI + adapter).
  copyTree(path.join(linear, 'bin'), path.join(out, 'bin'), srcRoot)

  copyMigrationGuide(out)
  guardNoWorkspaceRequires(srcRoot)
  guardNoWorkspaceRequires(path.join(out, 'bin'))
  return out
}

const DISTS = {
  skitterspec: buildBase,
  'skitterspec-linear': buildLinear,
}

function buildDist(name) {
  const fn = DISTS[name]
  if (!fn) throw new Error(`build-dist: unknown distribution "${name}" (want: ${Object.keys(DISTS).join(', ')})`)
  return fn()
}

function buildAll() {
  return Object.keys(DISTS).map(buildDist)
}

module.exports = {
  // Exported so a test can tell a SOURCE package from composed build output
  // without hardcoding names that drift. `packages/<name>/assets/` for each of
  // these is gitignored, so anything scanning `packages/*/assets` has to skip
  // them or its result depends on whether the reader has run a build.
  DISTS,
  copyMigrationGuide,
  WORKSPACE_REQUIRE_RE,
  rewriteRequires,
  guardNoWorkspaceRequires,
  buildBase,
  buildLinear,
  buildDist,
  buildAll,
}

// CLI: node scripts/build-dist.js [skitterspec|skitterspec-linear|all]
if (require.main === module) {
  const which = process.argv[2] || 'all'
  const built = which === 'all' ? buildAll() : [buildDist(which)]
  for (const out of built) console.log(`built ${path.relative(ROOT, out)}`)
}
