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
  'commit',
]

const RULES = ['spec-planning.md', 'commit-messages.md']

const SPEC_FOLDERS = ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']

const BACKLOG_INDEX = `<!-- Maintained by the spec skills — do not hand-edit. -->
<!-- Live view of the backlog. /spec prepends a row; /spec-ready updates status; -->
<!-- /spec-go and /spec-cancel remove the row when the spec leaves the backlog. -->

| Added | Spec | Type | Status |
|-------|------|------|--------|
`

const COMPLETE_INDEX = `<!-- Maintained by the spec skills — do not hand-edit. -->
<!-- Append-only completion log, newest first. /spec-complete prepends a row. -->

| Completed | Spec | Type |
|-----------|------|------|
`

const SPEC_MARKER_START = '<!-- skitterspec:start -->'
const SPEC_MARKER_END = '<!-- skitterspec:end -->'

const report = { created: [], updated: [], skipped: [], warnings: [] }

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

// backlog + complete are kept in git by their 00-index.md file, so they need no .gitkeep
const FOLDERS_WITH_INDEX = new Set(['backlog', 'complete'])

function installFolders(dir) {
  for (const folder of SPEC_FOLDERS) {
    const abs = path.join(dir, 'specs', folder)
    if (!fs.existsSync(abs)) {
      ensureDir(abs)
      report.created.push(rel(dir, abs) + '/')
      // keep otherwise-empty folders in git (those without an 00-index.md)
      if (!FOLDERS_WITH_INDEX.has(folder) && !fs.readdirSync(abs).length) {
        fs.writeFileSync(path.join(abs, '.gitkeep'), '')
      }
    } else {
      report.skipped.push(rel(dir, abs) + '/')
    }
  }
}

function installIndexes(dir, opts) {
  writeFile(dir, path.join(dir, 'specs', 'backlog', '00-index.md'), BACKLOG_INDEX, opts)
  writeFile(dir, path.join(dir, 'specs', 'complete', '00-index.md'), COMPLETE_INDEX, opts)
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
  line('unchanged', report.skipped)
  if (report.warnings.length) {
    process.stdout.write('\nwarnings:\n')
    for (const w of report.warnings) process.stdout.write(`  ! ${w}\n`)
  }
  process.stdout.write(
    '\nDone. Skills resolve as /spec, /spec-ready, /spec-go, /spec-complete,' +
      ' /spec-cancel, /spec-bug, /spec-init, /commit.\n' +
      'Next: tailor .claude/rules/spec-planning.md + the CLAUDE.md section to this' +
      " project's stack, then run /spec.\n",
  )
}

async function init({ dir, force, claudeMd, mode, release }) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  report.created.length = 0
  report.updated.length = 0
  report.skipped.length = 0
  report.warnings.length = 0

  installSkills(dir, { force })
  installRule(dir, { force })
  installFolders(dir)
  installIndexes(dir, { force })
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
