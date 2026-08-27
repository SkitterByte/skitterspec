'use strict'

/**
 * The committed **last-pushed snapshot** sidecar.
 *
 * One-way sync (repo → Linear) records what it last pushed per spec at
 * `{sync.baseDir}/{identifier}.base.json`, committed so each worktree carries its
 * own snapshot. The snapshot is a set of content hashes
 * (`{ issue, subIssues: {id:hash} }`, see compare.js
 * `snapshotOf`); `planChanges` diffs the current projection against it to decide
 * create/update/skip — no remote read. After a successful push the engine
 * rewrites it (`writeBase`). Generic JSON read/write; the shape is the caller's.
 */

const fs = require('node:fs')
const path = require('node:path')

function baseFile(dir, identifier, config) {
  return path.join(dir, config.sync.baseDir, `${identifier}.base.json`)
}

/**
 * Read a spec's committed base. Returns the parsed object, or `null` when no base
 * exists yet (never synced) — the compare treats null as "no prior state".
 */
function readBase(dir, identifier, config) {
  const file = baseFile(dir, identifier, config)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid base ${path.relative(dir, file)}: ${error.message}`)
  }
}

/**
 * Rewrite a spec's committed base with the freshly-synced field set. Creates
 * `{sync.baseDir}` if needed. Returns the absolute path written.
 */
function writeBase(dir, identifier, config, data) {
  const file = baseFile(dir, identifier, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  return file
}

/**
 * Back up the about-to-be-clobbered `side` ('local' | 'remote') into
 * `{sync.backupDir}` before a --force. `timestamp` is caller-supplied (the engine
 * never reads the clock); the name is made collision-safe with a `-N` counter.
 * Returns the absolute path written, or null when `data` is nullish (nothing to
 * back up — e.g. forcing a pull with no prior remote).
 */
function backup(side, dir, identifier, config, { timestamp, data }) {
  if (data == null) return null
  const backupRoot = path.join(dir, config.sync.backupDir)
  fs.mkdirSync(backupRoot, { recursive: true })

  const stem = `${identifier}.${side}.${timestamp}`
  let file = path.join(backupRoot, `${stem}.json`)
  let n = 1
  while (fs.existsSync(file)) {
    file = path.join(backupRoot, `${stem}-${n}.json`)
    n += 1
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  return file
}

module.exports = {
  readBase,
  writeBase,
  backup,
  baseFile,
}
