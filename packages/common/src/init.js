'use strict'

const fs = require('fs')
const path = require('path')

const { ensureWorktreeDirTrusted } = require('./env/trust.js')
const { repoInfo, expandTokens } = require('./env/resolve.js')

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

const RULES = listRules()

const SPEC_FOLDERS = ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']

// Opt-in config templates, scaffolded into specs/.core/ (the base ships the
// env.config isolation templates; a provider superset also ships its own).
const CORE_FILES = listCoreTemplates()

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
  trustWorktreeRoot(dir)
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
  const { repo, repoSlug } = repoInfo(dir)
  const rootAbs = path.resolve(dir, expandTokens(root, { repo, repoSlug }))
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
      ' /spec-cancel, /spec-bug, /spec-init, /spec-env, /spec-env-down.\n' +
      'Next: tailor .claude/rules/spec-planning.md + the CLAUDE.md section to this' +
      " project's stack, then run /spec.\n" +
      isolationNote,
  )
}

async function init({ dir, force, claudeMd, mode, isolation }) {
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

  printReport(dir, mode)
}

module.exports = {
  init,
  SKILLS,
  RULES,
  SPEC_FOLDERS,
}
