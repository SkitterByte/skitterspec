'use strict'

/**
 * Autonomous runs (feat-autonomous-run): the engine behind
 * `skitterspec spec-env run <resolve|phase|stop|compacted|end|status>`.
 *
 * A run is a spec built from one phase to the last without stopping for a
 * verdict at each one. This module answers two questions and keeps one record:
 *
 *   - is this run autonomous or supervised, and how does it end?
 *     (`resolveRun`: flag > an active run > the spec's `Run:` header > config
 *     > supervised)
 *   - what happened during it? (`.spec-env/runs/<spec>.json`: the phases it
 *     committed, the stops, the compactions, how it ended)
 *
 * The record is HISTORY plus one piece of state — whether a run is active —
 * and that one piece is what lets a run stopped on a red phase resume in its
 * own mode and ending when `Commit & Continue` is pressed. Nothing here
 * refuses a commit, arms a gate or decides a verdict; the skills do that.
 *
 * Pure apart from `readRun` / `writeRun`. `cli.js` does the resolving.
 */

const fs = require('node:fs')
const path = require('node:path')

const MODES = Object.freeze(['auto', 'supervised'])
const ENDINGS = Object.freeze(['pause', 'push', 'pr'])
const RUN_VERSION = 1

// Same grammar as `resume.js`'s headerValue: a blockquote `**Field:**` line.
function headerValue(text, field) {
  const m = new RegExp(`^>\\s*\\*\\*${field}:\\*\\*[ \\t]*(.*)$`, 'm').exec(String(text || ''))
  return m ? m[1].trim() : null
}

/**
 * The spec's own opt in/out: `> **Run:** auto` or `> **Run:** supervised`.
 *
 * Anything else — a typo, a trailing remark, an empty value — is cannot-tell
 * and answers null, so the config decides. A typo must never make a run
 * autonomous, and it must not make one supervised that the project configured
 * otherwise either: neither reading is safe to act on, so neither is taken.
 */
function parseRunHeader(text) {
  const v = headerValue(text, 'Run')
  if (!v) return null
  const word = v.toLowerCase()
  return MODES.includes(word) ? word : null
}

/**
 * Which mode and ending this run takes, and where each came from.
 *
 * Precedence, per half: a flag on the command; else the ACTIVE run's own
 * choice (a stopped run resumes as it started); else, for the mode, the spec's
 * header; else config; else supervised / pause.
 *
 * Flags are the one input that refuses rather than falls back, because a
 * person typed them: `--auto --supervised` together, or `--then` with a word
 * that is not an ending, is a mistake to say out loud, not one to guess past.
 *
 * @param {{ flags?: {auto?: boolean, supervised?: boolean, then?: string|null},
 *           header?: string|null, config?: object, active?: object|null }} input
 */
function resolveRun({ flags = {}, header = null, config = {}, active = null } = {}) {
  if (flags.auto && flags.supervised) {
    return { ok: false, reason: '--auto and --supervised contradict each other — pass one' }
  }
  if (flags.then != null && !ENDINGS.includes(flags.then)) {
    return { ok: false, reason: `--then ${flags.then} is not an ending — use ${ENDINGS.join(', ')}` }
  }
  const auto = (config && config.auto) || {}
  const live = active && active.active ? active : null

  let mode
  let modeFrom
  if (flags.auto) [mode, modeFrom] = ['auto', 'flag']
  else if (flags.supervised) [mode, modeFrom] = ['supervised', 'flag']
  else if (live) [mode, modeFrom] = [live.mode, 'run']
  else if (header) [mode, modeFrom] = [header, 'header']
  else if (MODES.includes(auto.default) && auto.default !== DEFAULT_AUTO.default) [mode, modeFrom] = [auto.default, 'config']
  else [mode, modeFrom] = ['supervised', 'default']

  let then
  let thenFrom
  if (flags.then) [then, thenFrom] = [flags.then, 'flag']
  else if (live && ENDINGS.includes(live.then)) [then, thenFrom] = [live.then, 'run']
  else if (ENDINGS.includes(auto.then) && auto.then !== DEFAULT_AUTO.then) [then, thenFrom] = [auto.then, 'config']
  else [then, thenFrom] = ['pause', 'default']

  const n = Number(auto.maxFixAttempts)
  const maxFixAttempts = Number.isInteger(n) && n >= 0 ? n : DEFAULT_AUTO.maxFixAttempts
  return { ok: true, mode, modeFrom, then, thenFrom, maxFixAttempts }
}

// What `env.config.json` → `auto` means when unset. Supervised is today's
// behaviour, so a project that never heard of autonomous runs sees none.
const DEFAULT_AUTO = Object.freeze({ default: 'supervised', then: 'pause', maxFixAttempts: 3 })

/* --------------------------------------------------------------------------
 * The run record
 * ------------------------------------------------------------------------ */

function runPath(stateDir, spec) {
  return path.join(stateDir, 'runs', `${spec}.json`)
}

/**
 * Read the record. Never throws. Three states, as every sidecar here:
 * absent (`record: null`), readable, or `corrupt` — which callers treat as
 * cannot-tell: no run is resumed from it and nothing is written over it.
 */
function readRun(stateDir, spec) {
  let raw
  try {
    raw = fs.readFileSync(runPath(stateDir, spec), 'utf8')
  } catch {
    return { record: null, corrupt: false }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { record: null, corrupt: true }
    return { record: parsed, corrupt: false }
  } catch {
    return { record: null, corrupt: true }
  }
}

function writeRun(stateDir, spec, record) {
  const p = runPath(stateDir, spec)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + '\n')
  return p
}

/**
 * Open a run, or keep the one already open. Pure.
 *
 * An active run is KEPT, not restarted: resolve runs again when a stopped run
 * resumes, and restarting would lose the phases, stops and compactions it has
 * already recorded. A flag given on the resume does replace the mode or
 * ending, because a person asked for it.
 */
function openRun(record, resolved, { spec, at, startPhase = null }) {
  if (record && record.active) {
    return { ...record, mode: resolved.mode, then: resolved.then, maxFixAttempts: resolved.maxFixAttempts }
  }
  const start = Number(startPhase)
  return {
    version: RUN_VERSION,
    spec,
    active: true,
    startedAt: at,
    endedAt: null,
    mode: resolved.mode,
    then: resolved.then,
    maxFixAttempts: resolved.maxFixAttempts,
    startPhase: Number.isInteger(start) && start > 0 ? start : 1,
    phases: [],
    stops: [],
    compactions: [],
    outcome: null,
    // The record of the PREVIOUS run, if any, is history and is not carried:
    // a run is one start-to-end, and a second run on the same spec is its own.
  }
}

/** The phase being built right now: one past the last committed, or the start. */
function currentPhase(record) {
  const done = (record.phases || []).map((p) => p.n).filter(Number.isInteger)
  return done.length ? Math.max(...done) + 1 : record.startPhase || 1
}

function recordPhase(record, { n, commit = null, snapshot = null, at }) {
  const num = Number(n)
  if (!Number.isInteger(num) || num < 1) return { record, ok: false, reason: `phase ${n} is not a phase number` }
  const phases = (record.phases || []).filter((p) => p.n !== num)
  phases.push({ n: num, commit: commit || null, snapshot: snapshot || null, at })
  phases.sort((a, b) => a.n - b.n)
  return { record: { ...record, phases }, ok: true }
}

function recordStop(record, { reason, at }) {
  const stops = (record.stops || []).concat({ phase: currentPhase(record), reason: String(reason || '').trim() || 'stopped', at })
  return { ...record, stops }
}

function recordCompaction(record, { at }) {
  const compactions = (record.compactions || []).concat({ phase: currentPhase(record), at })
  return { ...record, compactions }
}

function endRun(record, { at, outcome = null }) {
  return { ...record, active: false, endedAt: at, outcome: outcome || record.then }
}

/**
 * One line a report can carry: `compacted 2×, during phases 3 and 5`.
 * Empty when there were none — a run that never compacted says nothing.
 */
function compactionSummary(record) {
  const list = (record && record.compactions) || []
  if (!list.length) return ''
  const phases = [...new Set(list.map((c) => c.phase))].sort((a, b) => a - b)
  const named = phases.length === 1 ? `phase ${phases[0]}` : `phases ${phases.slice(0, -1).join(', ')} and ${phases[phases.length - 1]}`
  return `compacted ${list.length}×, during ${named}`
}

module.exports = {
  MODES,
  ENDINGS,
  DEFAULT_AUTO,
  parseRunHeader,
  resolveRun,
  runPath,
  readRun,
  writeRun,
  openRun,
  currentPhase,
  recordPhase,
  recordStop,
  recordCompaction,
  endRun,
  compactionSummary,
}
