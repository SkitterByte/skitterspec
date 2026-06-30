'use strict'

const fs = require('fs')
const path = require('path')

const ASSETS = path.join(__dirname, '..', 'assets')

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

const report = { created: [], updated: [], skipped: [] }

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
  process.stdout.write(
    '\nDone. Skills resolve as /spec, /spec-ready, /spec-go, /spec-complete,' +
      ' /spec-cancel, /spec-bug, /spec-init, /commit.\n' +
      'Next: tailor .claude/rules/spec-planning.md + the CLAUDE.md section to this' +
      " project's stack, then run /spec.\n",
  )
}

async function init({ dir, force, claudeMd, mode }) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  report.created.length = 0
  report.updated.length = 0
  report.skipped.length = 0

  installSkills(dir, { force })
  installRule(dir, { force })
  installFolders(dir)
  installIndexes(dir, { force })
  if (claudeMd) installClaudeMd(dir, { mode })

  printReport(dir, mode)
}

module.exports = { init, SKILLS, RULES, SPEC_FOLDERS }
