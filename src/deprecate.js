'use strict'

// Cleanup path for projects that installed release tooling from an older
// skitterspec (before it moved to @skitterbyte/skittership). `skitterspec update`
// detects the leftover files and — only on an explicit interactive "yes" or the
// --remove-release-tooling flag — removes exactly what skitterspec used to
// install. It never touches the user's generated CHANGELOG.md / RELEASES.md, nor
// any script it didn't add.

const fs = require('fs')
const path = require('path')

const SKITTERSHIP = '@skitterbyte/skittership'

// Files/dirs skitterspec used to install for release tooling (repo-relative).
const RELEASE_PATHS = [
  'skitterspec.config.json',
  path.join('scripts', 'generate-changelog.js'),
  path.join('scripts', 'generate-releases.js'),
  path.join('scripts', 'lib', 'git-commits.js'),
  path.join('scripts', 'lib', 'config.js'),
  path.join('.claude', 'skills', 'commit'),
  path.join('.claude', 'rules', 'commit-messages.md'),
]

// npm scripts skitterspec used to wire; only removed when their value still
// matches the generator command (so a user's custom override is preserved).
const HELPER_SCRIPTS = {
  changelog: 'node scripts/generate-changelog.js',
  'changelog:retro': 'node scripts/generate-changelog.js --retro',
  releases: 'node scripts/generate-releases.js',
  'releases:retro': 'node scripts/generate-releases.js --retro',
}

function readPkg(dir) {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    return null
  }
}

// Does package.json have a `version` script that runs the release generators?
function versionHookReferencesGenerators(pkg) {
  const v = pkg && pkg.scripts && pkg.scripts.version
  return typeof v === 'string' && /generate-(changelog|releases)\.js/.test(v)
}

// Is skittership the source of the release tooling here (rather than a leftover
// legacy skitterspec install)? True when the project has adopted skittership —
// its config file is present, or it's a declared dependency. In that case the
// release files are skittership's current install and must NOT be offered for
// removal (they'd just come back on the next `skittership init`).
function skittershipAdopted(dir) {
  if (fs.existsSync(path.join(dir, 'skittership.config.json'))) return true
  const pkg = readPkg(dir)
  const deps = Object.assign({}, pkg && pkg.dependencies, pkg && pkg.devDependencies)
  return Boolean(deps['@skitterbyte/skittership'])
}

// Report which release-tooling artifacts are present. `present` is true only when
// there are legacy artifacts to clean up (a file/dir or a generator-driven version
// hook) AND skittership hasn't been adopted — otherwise the files belong to a
// live skittership install, not an old bundled-skitterspec one.
function detectReleaseTooling(dir) {
  const files = RELEASE_PATHS.filter((rel) => fs.existsSync(path.join(dir, rel)))
  const pkg = readPkg(dir)
  const versionHook = versionHookReferencesGenerators(pkg)
  const adopted = skittershipAdopted(dir)
  return { present: (files.length > 0 || versionHook) && !adopted, files, versionHook, adopted }
}

// Remove an emptied directory, walking up while parents are left empty. Never
// climbs out of `dir`.
function pruneEmptyDirs(dir, startAbs) {
  let cur = startAbs
  while (cur.startsWith(dir) && cur !== dir && fs.existsSync(cur)) {
    if (fs.readdirSync(cur).length > 0) break
    fs.rmdirSync(cur)
    cur = path.dirname(cur)
  }
}

// Remove exactly the detected artifacts + unwire the version hook. Returns a
// report of what was removed. Scoped and non-destructive: only skitterspec's own
// files, and only npm scripts whose value still matches the generator command.
function removeReleaseTooling(dir, detection = detectReleaseTooling(dir)) {
  const removed = []

  for (const rel of detection.files) {
    const abs = path.join(dir, rel)
    if (!fs.existsSync(abs)) continue
    fs.rmSync(abs, { recursive: true, force: true })
    removed.push(rel)
    pruneEmptyDirs(dir, path.dirname(abs))
  }

  const pkg = readPkg(dir)
  if (pkg && pkg.scripts) {
    let changed = false
    if (versionHookReferencesGenerators(pkg)) {
      delete pkg.scripts.version
      removed.push('package.json (version hook)')
      changed = true
    }
    for (const [name, cmd] of Object.entries(HELPER_SCRIPTS)) {
      if (pkg.scripts[name] === cmd) {
        delete pkg.scripts[name]
        changed = true
      }
    }
    if (changed) {
      if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
    }
  }

  return { removed }
}

// One-line pointer shown when we detect release tooling but don't remove it
// (declined, or a non-interactive run).
function releaseToolingNotice() {
  return (
    `Release tooling has moved to ${SKITTERSHIP} — run ` +
    `npx ${SKITTERSHIP} init to keep it (your config is migrated automatically).`
  )
}

module.exports = {
  detectReleaseTooling,
  removeReleaseTooling,
  releaseToolingNotice,
  RELEASE_PATHS,
  SKITTERSHIP,
}
