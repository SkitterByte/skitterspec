'use strict'

/**
 * Run a worktree's bootstrap steps — the engine half of `spec-env bootstrap`.
 *
 * `planUp` decides WHAT a fresh worktree needs (`worktreeSteps`); this module
 * does it. Seeds are plain filesystem work, done here with `fs` and no shell
 * at all. `setup` commands are spawned with the worktree as their cwd.
 *
 * WHY THE ENGINE RUNS THEM. These steps used to be printed as shell for the
 * agent to run, and an agent does not copy shell faithfully. A consumer's
 * secrets hook refuses any Bash call naming a `.env` file, with one exception
 * for the exact printed shape — so every rewrite was refused, and the retry was
 * refused again by auto mode as a workaround. The call that replaces them,
 * `skitterspec spec-env bootstrap <name>`, names no file at all.
 *
 * Behaviour is the printed commands' behaviour, kept exactly: idempotent, one
 * `seeded …` / `… — skipped` line per seed, a seed missing from the primary
 * checkout is skipped rather than failed, and the run stops at the first
 * failing step.
 *
 * Every side effect goes through `io`, so the tests drive it with a real temp
 * directory and a fake spawn — no package manager.
 */

const realFs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

/** One line describing a step, for `--plan` and for the failure report. */
function describeStep(step) {
  switch (step.kind) {
    case 'seed':
      return `seed ${step.file} (${step.mode} from the primary checkout)`
    case 'setup':
      return `setup: ${step.command}`
    default:
      return `unknown step ${step.kind}`
  }
}

// `lstat` that answers null for a missing path rather than throwing.
function lstatOrNull(fs, p) {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

/**
 * Seed one gitignored file from the primary checkout.
 *
 * The source is tested with `existsSync`, which follows links — a dangling
 * link in the primary checkout is "not in main", exactly as `[ -e ]` read it.
 * The target is tested with `lstat`, which does not: an existing link, even a
 * dangling one, is somebody's deliberate state and is left alone.
 */
function runSeed(step, { cwd, mainRoot, fs, platform = process.platform }) {
  const src = path.join(mainRoot, step.file)
  const dst = path.join(cwd, step.file)
  if (!fs.existsSync(src)) {
    return { outcome: 'skipped', line: `seed ${step.file}: not in the root checkout — skipped` }
  }
  if (lstatOrNull(fs, dst)) {
    return { outcome: 'skipped', line: `seed ${step.file}: exists — skipped` }
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  if (step.mode === 'copy') {
    // A seed may be a directory (a local install seeds whole skill folders).
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, dst, { recursive: true })
    else fs.copyFileSync(src, dst)
    return { outcome: 'seeded', line: `seeded ${step.file} → ${src}` }
  }
  // WINDOWS WITHOUT DEVELOPER MODE CANNOT CREATE A SYMLINK (EPERM), and a
  // seed is what makes a fresh worktree runnable at all (chore-windows-ci). A
  // directory takes a junction there, which needs no privilege; a file that
  // still cannot be linked is copied — said, because a copy does not follow
  // later edits to the primary checkout's file the way a link would.
  const dir = fs.statSync(src).isDirectory()
  try {
    fs.symlinkSync(src, dst, dir && platform === 'win32' ? 'junction' : undefined)
  } catch (err) {
    if (dir || !(err && (err.code === 'EPERM' || err.code === 'EACCES'))) throw err
    fs.copyFileSync(src, dst)
    return {
      outcome: 'seeded',
      line: `seeded ${step.file} → ${src} (copied — this machine cannot create symlinks)`,
    }
  }
  return { outcome: 'seeded', line: `seeded ${step.file} → ${src}` }
}

/**
 * Spawn a setup command, through the shell — it is the project's own command
 * line.
 *
 * `stdout` is where the child's own output goes: inherited normally, so an
 * install streams as it runs, and moved to stderr under `--json` so the payload
 * on stdout stays parseable.
 */
function runSpawned(step, { cwd, spawn, childStdout }) {
  const stdio = ['ignore', childStdout, 'inherit']
  const res = spawn(step.command, { cwd, shell: true, stdio })
  if (res.error) {
    return { outcome: 'failed', line: `${describeStep(step)} — ${res.error.message}` }
  }
  if (res.status !== 0) {
    const why = res.status === null ? `killed by ${res.signal || 'a signal'}` : `exit ${res.status}`
    return { outcome: 'failed', line: `${describeStep(step)} — ${why}` }
  }
  return { outcome: 'ran', line: null }
}

/**
 * Run `steps` in order in `cwd`, stopping at the first that fails.
 *
 * io: { cwd, mainRoot, fs?, spawn?, write?, childStdout? }
 *   - `write(line)` receives every report line as it happens
 *   - `childStdout` is the stdio slot for spawned output ('inherit' default)
 *
 * Returns { ok, results: [{ step, outcome, line }], failedAt } — `failedAt` is
 * the 1-based index of the step that stopped the run, or null.
 */
function runBootstrap(steps, io) {
  const ctx = {
    cwd: io.cwd,
    mainRoot: io.mainRoot,
    fs: io.fs || realFs,
    platform: io.platform || process.platform,
    spawn: io.spawn || spawnSync,
    childStdout: io.childStdout || 'inherit',
  }
  const write = io.write || (() => {})
  const results = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    // A spawned step announces itself BEFORE it runs, so the streamed output
    // that follows has a heading.
    if (step.kind === 'setup') write(describeStep(step))
    let r
    try {
      if (step.kind === 'seed') r = runSeed(step, ctx)
      else if (step.kind === 'setup') r = runSpawned(step, ctx)
      else r = { outcome: 'failed', line: describeStep(step) }
    } catch (err) {
      r = { outcome: 'failed', line: `${describeStep(step)} — ${err.message}` }
    }
    results.push({ step, ...r })
    if (r.line && r.outcome !== 'failed' && r.outcome !== 'refused') write(r.line)
    if (r.outcome === 'failed' || r.outcome === 'refused') {
      return { ok: false, results, failedAt: i + 1 }
    }
  }
  return { ok: true, results, failedAt: null }
}

module.exports = { runBootstrap, describeStep }
