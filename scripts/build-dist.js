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

const { composeAssets, loadFragments } = require('./compose.js')

const ROOT = path.join(__dirname, '..')
const PKGS = path.join(ROOT, 'packages')

// The output subdirs each build regenerates (everything else in a distribution
// package — package.json, README, MIGRATION — is committed and left untouched).
const BUILT_DIRS = ['assets', 'bin', 'src']

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
function copyFile(src, dst, srcRoot) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  if (srcRoot && src.endsWith('.js')) {
    fs.writeFileSync(dst, rewriteRequires(fs.readFileSync(src, 'utf8'), dst, srcRoot))
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
function overlayTree(srcDir, dstDir) {
  copyTree(srcDir, dstDir)
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

  // Assets: compose common with every seam emptied (no provider).
  composeAssets(path.join(common, 'assets'), path.join(out, 'assets'), {})
  // bin + src: common is already self-contained (only `prompts` + relative requires).
  copyTree(path.join(common, 'src'), path.join(out, 'src'))
  copyTree(path.join(common, 'bin'), path.join(out, 'bin'))

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
  // Linear-only skills and the linear.config templates.
  const fragments = loadFragments(path.join(linear, 'assets', 'seams'))
  composeAssets(path.join(common, 'assets'), path.join(out, 'assets'), fragments)
  overlayTree(path.join(linear, 'assets', 'skills'), path.join(out, 'assets', 'skills'))
  overlayTree(path.join(linear, 'assets', 'core'), path.join(out, 'assets', 'core'))

  // src: common at the root; the engine + adapter vendored under vendor/. All JS
  // has its workspace requires rewritten relative to srcRoot.
  copyTree(path.join(common, 'src'), srcRoot, srcRoot)
  copyFile(path.join(syncCore, 'index.js'), path.join(srcRoot, 'vendor', 'sync-core', 'index.js'), srcRoot)
  copyTree(path.join(syncCore, 'src'), path.join(srcRoot, 'vendor', 'sync-core', 'src'), srcRoot)
  copyTree(path.join(linear, 'src'), path.join(srcRoot, 'vendor', 'linear'), srcRoot)
  // bin: the superset entry point (delegates to the vendored base CLI + adapter).
  copyTree(path.join(linear, 'bin'), path.join(out, 'bin'), srcRoot)

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
