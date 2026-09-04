'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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

const SPEC_FOLDERS = ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']

// Opt-in config templates, scaffolded into specs/.core/ (the base ships the
// env.config isolation templates; a provider superset also ships its own).
const CORE_FILES = listCoreTemplates()

// The CLI is a local devDependency and never on PATH, so a command file that
// pre-executes it must carry a literal, working invocation. Detect the runner
// from the lockfile and bake it in at write time.
//
// The lockfile is a POSITIVE signal — a file that must be present for the answer
// to be yes — rather than an absence. When none is found we do not guess a
// package manager we have no evidence for; `npx` is the fallback because it is
// the one runner that works across all three installs.
const PACKAGE_MANAGERS = [
  ['pnpm-lock.yaml', 'pnpm exec'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npx'],
  ['bun.lockb', 'bunx'],
]

function detectPackageManager(dir) {
  for (const [lockfile, exec] of PACKAGE_MANAGERS) {
    if (fs.existsSync(path.join(dir, lockfile))) return exec
  }
  return 'npx'
}

// Fill a command file's `{{exec}}` placeholders. Kept a pure function of
// (content, dir) so `managedTargets` can compare against exactly what
// `installCommands` would write — otherwise every install would hash as
// customized on the next run.
function renderCommand(content, dir) {
  return content.split('{{exec}}').join(detectPackageManager(dir))
}

const SPEC_MARKER_START = '<!-- skitterspec:start -->'
const SPEC_MARKER_END = '<!-- skitterspec:end -->'

const report = { created: [], updated: [], skipped: [], removed: [], customized: [], healed: [], warnings: [] }

function resetReport() {
  for (const k of Object.keys(report)) report[k].length = 0
  for (const k of Object.keys(writtenHashes)) delete writtenHashes[k]
}

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

function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex')
}

// The full managed set for a target dir: repo-relative path, absolute path, and
// the bundled content that ships in this distribution's assets.
function managedTargets(dir) {
  const out = []
  const add = (assetRel, targetAbs, render = (c) => c) =>
    out.push({
      relPath: rel(dir, targetAbs),
      abs: targetAbs,
      bundled: render(fs.readFileSync(path.join(ASSETS, assetRel), 'utf8'), dir),
    })
  for (const name of SKILLS) add(path.join('skills', name, 'SKILL.md'), path.join(dir, '.claude', 'skills', name, 'SKILL.md'))
  for (const name of COMMANDS)
    add(path.join('commands', name), path.join(dir, '.claude', 'commands', name), renderCommand)
  for (const name of RULES) add(path.join('rules', name), path.join(dir, '.claude', 'rules', name))
  for (const asset of CORE_FILES) add(asset, path.join(dir, 'specs', '.core', path.basename(asset)))
  return out
}

// Read the manifest (tolerant: missing/malformed → an empty baseline).
function readManifest(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
      return { version: parsed.version || MANIFEST_VERSION, files: parsed.files }
    }
  } catch {
    /* missing or malformed → empty baseline */
  }
  return { version: MANIFEST_VERSION, files: {} }
}

function writeManifest(dir, files) {
  const target = path.join(dir, MANIFEST_FILE)
  ensureDir(path.dirname(target))
  const sorted = {}
  for (const k of Object.keys(files).sort()) sorted[k] = files[k]
  fs.writeFileSync(target, JSON.stringify({ version: MANIFEST_VERSION, files: sorted }, null, 2) + '\n')
}

// Classify a managed file against the manifest baseline.
//   missing    — not on disk
//   pristine   — ours to update: it matches the package asset, or the hash we recorded
//   customized — on disk but differs from both — a user edit; keep it
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
  const abs = path.join(dir, relPath)
  if (!fs.existsSync(abs)) return 'missing'
  const onDisk = fs.readFileSync(abs, 'utf8')
  if (bundled !== undefined && onDisk === bundled) return 'pristine'
  const known = manifest.files[relPath]
  return known && sha1(onDisk) === known ? 'pristine' : 'customized'
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
  const merged = { ...readManifest(dir).files, ...writtenHashes }
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
  writeManifest(dir, next)
}

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

function installCommands(dir, opts) {
  for (const name of COMMANDS) {
    const content = renderCommand(
      fs.readFileSync(path.join(ASSETS, 'commands', name), 'utf8'),
      dir,
    )
    writeFile(dir, path.join(dir, '.claude', 'commands', name), content, opts)
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
  const claude = path.join(dir, 'CLAUDE.md')
  return fs.existsSync(claude) && fs.readFileSync(claude, 'utf8').includes(SPEC_MARKER_START)
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
  if (state === 'customized') {
    if (force) return write('updated')
    writtenHashes[relPath] = manifest.files[relPath] || writtenHashes[relPath] // keep baseline
    // Carry the change the user just DECLINED. A bare filename tells them a
    // decision was made on their behalf but not what it was, which leaves
    // "clobber and re-apply my edits by hand" as the only safe way to upgrade.
    const { added, removed, hunks } = linesDiff(fs.readFileSync(abs, 'utf8'), bundled)
    return report.customized.push({ relPath, added, removed, hunks })
  }
  // pristine — update only if the bundled content actually changed
  if (fs.readFileSync(abs, 'utf8') === bundled) {
    // The file is ours and current, but the manifest disagreed — record the
    // repair rather than healing in silence: a file that quietly starts
    // updating again is as opaque as one that quietly stopped.
    if (manifest.files[relPath] !== sha1(bundled)) report.healed.push(relPath)
    writtenHashes[relPath] = sha1(bundled)
    return report.skipped.push(relPath)
  }
  write('updated')
}

function resync(dir, { force = false, claudeMd = true, diff = false } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  resetReport()
  const manifest = readManifest(dir)
  for (const t of managedTargets(dir)) resyncManagedFile(dir, t, manifest, force)
  installFolders(dir)
  removeRetiredFiles(dir)
  pruneRetiredManaged(dir, manifest)
  if (claudeMd) installClaudeMd(dir, { mode: 'update' })
  flushManifest(dir)
  printReport(dir, 'resync', { diff })
}

// The never-touch set: START AGAIN may only delete a known managed file, and may
// never delete spec content or active config (defense-in-depth — the manifest
// never lists these, but a tampered/foreign entry must still be refused).
const PROTECTED_SPEC_BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']
const PROTECTED_CONFIG = ['env.config.json', 'linear.config.json']
const PROTECTED_DIRS = ['linear-base', 'linear-backups']

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
  line('manifest repaired', report.healed)
  line('unchanged', report.skipped)
  if (report.warnings.length) {
    process.stdout.write('\nwarnings:\n')
    for (const w of report.warnings) process.stdout.write(`  ! ${w}\n`)
  }
  if (diff) {
    for (const c of report.customized) {
      if (!c.hunks.length) continue
      process.stdout.write(`\n--- ${c.relPath} (kept — this is what you declined)\n`)
      for (const h of c.hunks) process.stdout.write(`${h}\n`)
    }
  } else if (report.customized.length) {
    process.stdout.write('\nRe-run with --diff to see the changes those files declined.\n')
  }
  const isolationOn = fs.existsSync(path.join(dir, 'specs', '.core', 'env.config.json'))
  const isolationNote = isolationOn
    ? 'Per-spec isolation is ON: every in-progress spec gets its own git worktree' +
      ' at /spec-go (Docker is a per-spec escalation — set > **Stack:** in the spec).\n'
    : 'Per-spec isolation is opt-in: re-run with --isolation (or copy' +
      ' specs/.core/env.config.json.example → env.config.json) to enable it.\n'
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
    '\nDone. Skills resolve as /spec, /spec-go, /spec-complete, /spec-cancel,' +
      ' /spec-bug, /spec-review, /spec-init, /spec-connect.\n' +
      'Next: tailor .claude/rules/spec-planning.md + the CLAUDE.md section to this' +
      " project's stack, then run /spec.\n" +
      isolationNote +
      trackerNote,
  )
}

async function init({ dir, force, claudeMd, mode, isolation }) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  resetReport()

  installSkills(dir, { force })
  installCommands(dir, { force })
  installRule(dir, { force })
  installFolders(dir)
  removeRetiredFiles(dir)
  installCore(dir, { force })
  // Adopting isolation writes the live env.config.json — init only, never update.
  if (mode !== 'update') installIsolation(dir, { enabled: isolation }, { force })
  if (claudeMd) installClaudeMd(dir, { mode })

  // Record what we wrote (and migrate a pre-manifest repo) so a later resync can
  // tell our files from the user's.
  flushManifest(dir)

  printReport(dir, mode)
}

module.exports = {
  init,
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
  isExistingSetup,
  resync,
  reset,
  assertSafeToDelete,
  detectPackageManager,
  renderCommand,
}
