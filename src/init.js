'use strict'

const fs = require('fs')
const path = require('path')

const { loadConfig, SCHEMA_VERSION } = require('./config.js')

const ASSETS = path.join(__dirname, '..', 'assets')

// Shipped generator scripts, copied into the consumer's scripts/ when enabled.
const SHARED_LIB = [
  path.join('scripts', 'lib', 'git-commits.js'),
  path.join('scripts', 'lib', 'config.js'),
]
const CHANGELOG_SCRIPT = path.join('scripts', 'generate-changelog.js')
const RELEASES_SCRIPT = path.join('scripts', 'generate-releases.js')
const CONFIG_FILE = 'skitterspec.config.json'

const SKILLS = [
  'spec',
  'spec-bug',
  'spec-ready',
  'spec-review',
  'spec-go',
  'spec-complete',
  'spec-cancel',
  'spec-init',
  'spec-env',
  'spec-env-down',
  'spec-status',
  'spec-pull',
  'spec-push',
  'commit',
]

const RULES = ['spec-planning.md', 'commit-messages.md']

const SPEC_FOLDERS = ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']

// Opt-in per-spec isolation config, scaffolded into specs/.core/ as templates
// the consumer copies (env.config.json.example → env.config.json to adopt).
const CORE_FILES = [
  path.join('core', 'env.config.json.example'),
  path.join('core', 'env.config.md'),
  path.join('core', 'linear.config.json.example'),
  path.join('core', 'linear.config.md'),
]

const SPEC_MARKER_START = '<!-- skitterspec:start -->'
const SPEC_MARKER_END = '<!-- skitterspec:end -->'

const report = { created: [], updated: [], skipped: [], removed: [], warnings: [] }

// Folder index files scaffolded by earlier versions, now retired. `init`/`update`
// deletes any left behind so upgrading projects don't keep stale caches.
const RETIRED_FILES = [
  path.join('specs', 'backlog', '00-index.md'),
  path.join('specs', 'complete', '00-index.md'),
]

function rel(dir, p) {
  return path.relative(dir, p) || '.'
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function writeFile(dir, target, content, { force }) {
  if (fs.existsSync(target)) {
    if (!force) {
      report.skipped.push(rel(dir, target))
      return
    }
    const existing = fs.readFileSync(target, 'utf8')
    if (existing === content) {
      report.skipped.push(rel(dir, target))
      return
    }
    fs.writeFileSync(target, content)
    report.updated.push(rel(dir, target))
    return
  }
  ensureDir(path.dirname(target))
  fs.writeFileSync(target, content)
  report.created.push(rel(dir, target))
}

function copyAsset(dir, assetRelPath, targetAbs, opts) {
  const content = fs.readFileSync(path.join(ASSETS, assetRelPath), 'utf8')
  writeFile(dir, targetAbs, content, opts)
}

function installSkills(dir, opts) {
  for (const name of SKILLS) {
    copyAsset(
      dir,
      path.join('skills', name, 'SKILL.md'),
      path.join(dir, '.claude', 'skills', name, 'SKILL.md'),
      opts,
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
// example asset so /spec-go provisions a worktree for every in-progress spec.
// Only called when the operator opts in, and never on `update` (adopting isolation
// is a deliberate choice, not something a re-sync flips on). Idempotent: writeFile
// never clobbers an existing env.config.json without --force.
function installIsolation(dir, { enabled }, opts) {
  if (!enabled) return
  copyAsset(
    dir,
    path.join('core', 'env.config.json.example'),
    path.join(dir, 'specs', '.core', 'env.config.json'),
    opts,
  )
}

function installClaudeMd(dir, { mode }) {
  const section = fs.readFileSync(path.join(ASSETS, 'claude-md-section.md'), 'utf8').trim()
  const block = `${SPEC_MARKER_START}\n${section}\n${SPEC_MARKER_END}\n`
  const target = path.join(dir, 'CLAUDE.md')

  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, `# ${path.basename(dir)}\n\n${block}`)
    report.created.push('CLAUDE.md')
    return
  }

  const existing = fs.readFileSync(target, 'utf8')

  if (existing.includes(SPEC_MARKER_START) && existing.includes(SPEC_MARKER_END)) {
    if (mode !== 'update') {
      report.skipped.push('CLAUDE.md (spec workflow already present)')
      return
    }
    const re = new RegExp(`${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`)
    const next = existing.replace(re, block)
    if (next === existing) {
      report.skipped.push('CLAUDE.md')
    } else {
      fs.writeFileSync(target, next)
      report.updated.push('CLAUDE.md (spec workflow section)')
    }
    return
  }

  if (/^##\s+Spec workflow/m.test(existing)) {
    report.skipped.push('CLAUDE.md (has a manual "Spec workflow" section — left alone)')
    return
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n'
  fs.writeFileSync(target, `${existing}${sep}${block}`)
  report.updated.push('CLAUDE.md (appended spec workflow section)')
}

// --- release tooling (changelog / release notes) ---------------------------

// Build a release-config object from a loaded skitterspec.config.json.
function releaseFromConfig(cfg) {
  return {
    changelog: { enabled: cfg.changelog.enabled, file: cfg.changelog.file },
    releases: {
      enabled: cfg.releases.enabled,
      file: cfg.releases.file,
      productName: cfg.releases.productName,
      scopeAreas: cfg.releases.scopeAreas,
    },
    versionHook: cfg.versionHook,
  }
}

function serializeConfig(release) {
  return (
    JSON.stringify(
      {
        version: SCHEMA_VERSION,
        changelog: release.changelog,
        releases: release.releases,
        versionHook: release.versionHook,
      },
      null,
      2,
    ) + '\n'
  )
}

// Write the resolved config. The release object already folds in any existing
// file (the CLI seeds it from loadConfig), so this is a merge, not a clobber —
// safe to persist without --force. Unchanged content is left alone.
function writeConfig(dir, release) {
  const target = path.join(dir, CONFIG_FILE)
  const content = serializeConfig(release)
  const exists = fs.existsSync(target)
  if (exists && fs.readFileSync(target, 'utf8') === content) {
    report.skipped.push(CONFIG_FILE)
    return
  }
  fs.writeFileSync(target, content)
  report[exists ? 'updated' : 'created'].push(CONFIG_FILE)
}

function installScripts(dir, release, opts) {
  if (!release.changelog.enabled && !release.releases.enabled) return
  for (const lib of SHARED_LIB) {
    copyAsset(dir, lib, path.join(dir, lib), opts)
  }
  if (release.changelog.enabled) {
    copyAsset(dir, CHANGELOG_SCRIPT, path.join(dir, CHANGELOG_SCRIPT), opts)
  }
  if (release.releases.enabled) {
    copyAsset(dir, RELEASES_SCRIPT, path.join(dir, RELEASES_SCRIPT), opts)
  }
}

// Idempotently add the npm scripts that drive generation at `npm version`.
// Never overwrites a user's custom `version` script without --force.
function wireVersionHook(dir, release, { force }) {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    report.skipped.push('version hook (no package.json)')
    return
  }

  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    report.warnings.push('package.json is not valid JSON — skipped version hook wiring')
    return
  }

  const genCmds = []
  const addFiles = []
  if (release.changelog.enabled) {
    genCmds.push('node scripts/generate-changelog.js')
    addFiles.push(release.changelog.file)
  }
  if (release.releases.enabled) {
    genCmds.push('node scripts/generate-releases.js')
    addFiles.push(release.releases.file)
  }
  if (genCmds.length === 0) return

  const versionCmd = [...genCmds, `git add ${addFiles.join(' ')}`].join(' && ')

  const before = JSON.stringify(pkg)
  pkg.scripts = pkg.scripts || {}

  if (pkg.scripts.version && pkg.scripts.version !== versionCmd && !force) {
    report.warnings.push(
      'Kept your existing "version" npm script. To regenerate on release, add:\n' +
        `      "version": "${versionCmd}"  (or re-run with --force)`,
    )
  } else {
    pkg.scripts.version = versionCmd
  }

  const helpers = {}
  if (release.changelog.enabled) {
    helpers.changelog = 'node scripts/generate-changelog.js'
    helpers['changelog:retro'] = 'node scripts/generate-changelog.js --retro'
  }
  if (release.releases.enabled) {
    helpers.releases = 'node scripts/generate-releases.js'
    helpers['releases:retro'] = 'node scripts/generate-releases.js --retro'
  }
  for (const [name, cmd] of Object.entries(helpers)) {
    if (pkg.scripts[name] && pkg.scripts[name] !== cmd && !force) continue
    pkg.scripts[name] = cmd
  }

  if (JSON.stringify(pkg) !== before) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    report.updated.push('package.json (version hook + scripts)')
  } else {
    report.skipped.push('package.json (version hook already present)')
  }
}

function printReport(dir, mode) {
  const line = (label, items) => {
    if (!items.length) return
    process.stdout.write(`\n${label}:\n`)
    for (const it of items) process.stdout.write(`  ${it}\n`)
  }
  process.stdout.write(`\nskitterspec ${mode} → ${dir}\n`)
  line('created', report.created)
  line('updated', report.updated)
  line('removed', report.removed)
  line('unchanged', report.skipped)
  if (report.warnings.length) {
    process.stdout.write('\nwarnings:\n')
    for (const w of report.warnings) process.stdout.write(`  ! ${w}\n`)
  }
  const isolationOn = fs.existsSync(path.join(dir, 'specs', '.core', 'env.config.json'))
  const isolationNote = isolationOn
    ? 'Per-spec isolation is ON: every in-progress spec gets its own git worktree' +
      ' at /spec-go (Docker is a per-spec escalation — set > **Stack:** in the spec).\n'
    : 'Per-spec isolation is opt-in: re-run with --isolation (or copy' +
      ' specs/.core/env.config.json.example → env.config.json) to enable it.\n'
  process.stdout.write(
    '\nDone. Skills resolve as /spec, /spec-ready, /spec-go, /spec-complete,' +
      ' /spec-cancel, /spec-bug, /spec-init, /spec-env, /spec-env-down,' +
      ' /spec-status, /spec-pull, /spec-push, /commit.\n' +
      'Next: tailor .claude/rules/spec-planning.md + the CLAUDE.md section to this' +
      " project's stack, then run /spec.\n" +
      isolationNote,
  )
}

async function init({ dir, force, claudeMd, mode, release, isolation }) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  report.created.length = 0
  report.updated.length = 0
  report.skipped.length = 0
  report.removed.length = 0
  report.warnings.length = 0

  installSkills(dir, { force })
  installRule(dir, { force })
  installFolders(dir)
  removeRetiredFiles(dir)
  installCore(dir, { force })
  // Adopting isolation writes the live env.config.json — init only, never update.
  if (mode !== 'update') installIsolation(dir, { enabled: isolation }, { force })
  if (claudeMd) installClaudeMd(dir, { mode })

  // Release tooling. The CLI resolves `release` from flags/prompts; when called
  // directly (e.g. tests, update) fall back to the on-disk/default config.
  const rel = release || releaseFromConfig(loadConfig(dir))
  if (mode !== 'update') writeConfig(dir, rel)
  installScripts(dir, rel, { force })
  if (mode !== 'update' && rel.versionHook) wireVersionHook(dir, rel, { force })

  printReport(dir, mode)
}

module.exports = {
  init,
  SKILLS,
  RULES,
  SPEC_FOLDERS,
  releaseFromConfig,
}
