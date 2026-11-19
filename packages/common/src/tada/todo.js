'use strict'

/**
 * The morning half of the ta-da list (feat-spec-todo, phase 2): where each
 * project was left on the last day with any activity, and what is ahead. It
 * reads the same digest `skitterspec tada` does — once for the lookback, once
 * for the day it found — so the two can never disagree about what happened.
 * Pure: every input arrives already read.
 */

const fs = require('node:fs')
const path = require('node:path')

const { localDay } = require('./window.js')
const { waitingPasses, readGate, gateState } = require('../env/review.js')

// Far enough to bridge a long weekend or a week away; past it, "where did I
// leave off" has no useful answer and the report says so.
const LOOKBACK_DAYS = 14

function daysBefore(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)
}

/** Every instant a digest saw something happen: prompts, sessions, commits, moves. */
function activityTimes(digest) {
  const times = []
  for (const p of digest.projects) {
    for (const g of p.groups) {
      for (const s of g.sessions) {
        times.push(s.start, s.end)
        for (const pr of s.prompts) times.push(pr.at)
      }
      for (const c of g.commits) times.push(c.at)
      for (const e of g.events) times.push(e.at)
    }
  }
  return times.filter(Boolean)
}

/**
 * The local midnight of the most recent day before `todayStart` with any
 * activity, at most `lookback` days back — so Monday reads Friday and a day
 * off is skipped. Null when nothing falls in the lookback.
 *
 * @param {string[]} times  ISO instants (`activityTimes`)
 * @param {Date} todayStart  local midnight today
 */
function lastActiveDay(times, todayStart, lookback = LOOKBACK_DAYS) {
  const floor = daysBefore(todayStart, lookback).getTime()
  const end = todayStart.getTime()
  let best = null
  for (const t of times) {
    const ms = Date.parse(t)
    if (Number.isNaN(ms) || ms < floor || ms >= end) continue
    if (best === null || ms > best) best = ms
  }
  if (best === null) return null
  const d = new Date(best)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const EVENT = { written: 'written', started: 'started', completed: 'completed', cancelled: 'cancelled' }
const eventText = (e) => (e.kind === 'phase-done' ? `phase ${e.phase} done` : EVENT[e.kind] || e.kind)

/**
 * Where one group was left: its last move or commit, whichever came later —
 * a commit after a move is the newer fact. Null when the group only has
 * sessions or an in-flight row.
 */
function leftOf(g) {
  const last = [
    ...g.events.map((e) => ({ at: e.at, text: eventText(e) })),
    ...g.commits.map((c) => ({ at: c.at, text: `${c.sha} ${c.subject}` })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return last.length ? last[last.length - 1].text : null
}

// The last thing typed in the group's last session — what was on the
// person's mind when they stopped.
function lastPrompt(g) {
  const s = g.sessions[g.sessions.length - 1]
  const p = s && s.prompts[s.prompts.length - 1]
  return p ? `${p.command ? `${p.command} ` : ''}${p.text}`.trim() : null
}

/**
 * What stands in a project's way, read only for the specs in flight there: a
 * pass waiting on the review page, or a gate armed by a phase that ended. A
 * pass for a spec no longer in flight is an old one nobody is waiting on, and
 * is left out rather than reported as a blocker.
 *
 * @param {object} a
 *   - `specs`   the project's in-flight spec names
 *   - `passes`  `waitingPasses(...).passes`
 *   - `gates`   `{ [spec]: gateState(...) }`; a missing or `unknown` state is
 *               cannot-tell, and says nothing
 */
function blockersFrom({ specs, passes = [], gates = {}, parked = {} }) {
  const want = new Set(specs)
  const out = []
  for (const p of passes) {
    if (want.has(p.spec)) out.push({ spec: p.spec, kind: 'verdict', verdict: p.verdict, code: p.code, at: p.at })
  }
  for (const spec of specs) {
    const g = gates[spec]
    if (g && g.state === 'armed') out.push({ spec, kind: 'gate', phase: g.gate ? g.gate.phase : null })
  }
  // A spec parked on something outside the repo (feat-spec-resume): the line
  // that holds its next build, from `spec-env resume`'s `blockingNext`. A wait
  // planned for a later phase holds nothing yet and is not listed.
  for (const spec of specs) {
    const b = parked[spec]
    if (b) out.push({ spec, kind: 'parked', where: b.where, text: b.text, until: b.until })
  }
  return out
}

/**
 * `blockersFrom`, read off one repo's review store. A store that does not
 * exist — a repo that never rendered a review — is nothing in the way, not a
 * failure; an unreadable gate is `gateState`'s cannot-tell and says nothing.
 *
 * @param {string} reviews   the repo's reviews dir (`<state dir>/reviews`)
 * @param {string[]} specs   its in-flight spec names
 * @param {boolean} [required]  `review.required`; false opts the gates out
 */
function readBlockers(reviews, specs, required, parked = {}) {
  if (!fs.existsSync(reviews)) return blockersFrom({ specs, parked })
  const gates = {}
  for (const spec of specs) gates[spec] = gateState({ ...readGate(path.join(reviews, `${spec}.html`), spec), required })
  return blockersFrom({ specs, passes: waitingPasses(reviews).passes, gates, parked })
}

/**
 * The to-do: the left-off day's projects, each open spec reduced to where it
 * was left, the specs that day finished by name, today's activity so far, and
 * what is blocking each project.
 *
 * @param {object} a
 *   - `leftOff`     the digest for the left-off day, or null when none
 *   - `leftOffDay`  that day's local midnight, or null
 *   - `today`       today's digest so far
 *   - `home`        the home project as a digest project (in-flight groups
 *                   only) for when neither digest lists it, else null
 *   - `blockersFor` `(repo, specs) => blockers` — read only for a repo
 */
function buildTodo({ leftOff, leftOffDay, today, home = null, blockersFor = () => [] }) {
  const projects = new Map()
  const keyOf = (p) => p.repo || p.name
  const entry = (p) => {
    const k = keyOf(p)
    if (!projects.has(k)) projects.set(k, { repo: p.repo, name: p.name, here: false, groups: [], finished: [], today: { commits: 0, moves: 0 } })
    const e = projects.get(k)
    if (p.here) e.here = true
    return e
  }

  for (const p of leftOff ? leftOff.projects : []) {
    const e = entry(p)
    for (const g of p.groups) {
      // The morning wants what is still open. A spec the day finished is said
      // once, by name; work on no spec is history, not a place to pick up.
      if (!g.inFlight) {
        if (g.spec && g.events.some((ev) => ev.kind === 'completed' || ev.kind === 'cancelled')) e.finished.push(g.spec)
        continue
      }
      const left = leftOf(g)
      const prompt = lastPrompt(g)
      e.groups.push({ spec: g.spec, branch: g.branch, ...(g.ticket ? { ticket: g.ticket } : {}), left, prompt, inFlight: g.inFlight })
    }
  }
  for (const p of today.projects) {
    const e = entry(p)
    const known = new Set(e.groups.map((g) => g.spec).filter(Boolean))
    for (const g of p.groups) {
      e.today.commits += g.commits.length
      e.today.moves += g.events.length
      // What is ahead in a project the left-off day did not touch.
      if (g.spec && g.inFlight && !known.has(g.spec)) {
        e.groups.push({ spec: g.spec, branch: g.branch, ...(g.ticket ? { ticket: g.ticket } : {}), left: null, prompt: null, inFlight: g.inFlight })
      }
    }
  }
  if (home && !projects.has(keyOf(home))) {
    const e = entry({ ...home, here: true })
    for (const g of home.groups) if (g.inFlight) e.groups.push({ spec: g.spec, branch: null, left: null, prompt: null, inFlight: g.inFlight })
  }
  // Ideas are counted for home only: the count is this project's to act on,
  // and asking every project's tracker would turn a morning read into a crawl.
  // Null — could not ask — and zero both print nothing.
  if (home && home.ideas > 0) projects.get(keyOf(home)).ideas = home.ideas

  const list = [...projects.values()]
    .map((e) => {
      const specs = e.groups.filter((g) => g.spec && g.inFlight).map((g) => g.spec)
      return { ...e, blocked: e.repo && specs.length ? blockersFor(e.repo, specs) : [] }
    })
    .filter((e) => e.groups.length || e.finished.length || e.today.commits || e.today.moves || e.ideas)
    // The home project first: it is the one this session acts on.
    .sort((a, b) => (a.here !== b.here ? (a.here ? -1 : 1) : a.name.localeCompare(b.name)))

  return {
    kind: 'todo',
    leftOff: leftOffDay ? { day: localDay(leftOffDay) } : null,
    lookbackDays: LOOKBACK_DAYS,
    ...(today.category ? { category: today.category } : {}),
    projects: list,
    notes: [...new Set([...(leftOff ? leftOff.notes : []), ...today.notes])],
  }
}

const ageText = (at, now) => {
  const ms = now - Date.parse(at)
  if (Number.isNaN(ms) || ms < 0) return ''
  const h = Math.floor(ms / 3_600_000)
  return h < 24 ? ` · ${h}h` : ` · ${Math.floor(h / 24)}d`
}

function blockedText(b, now) {
  if (b.kind === 'parked') {
    const where = b.where === 'spec' ? '' : ` (phase ${b.where})`
    // Compared as local calendar days: a wait "until" a date has run out once
    // that day has begun, not at UTC midnight.
    const due = b.until && b.until <= localDay(now)
    const until = b.until ? (due ? ` · until ${b.until}, now passed — ready to resume` : ` · until ${b.until}`) : ''
    return `${b.spec} — parked${where}: ${b.text}${until} · /spec-resume ${b.spec}`
  }
  if (b.kind === 'gate') return `${b.spec} — gate armed${b.phase ? `, phase ${b.phase}` : ''}: a verdict is owed`
  return `${b.spec} — ${b.verdict || 'a'} verdict waiting (${b.code}${b.at ? ageText(b.at, now) : ''})`
}

/**
 * The to-do as text — the same markers as `tada`, plus `left:` for where a
 * group stopped, `finished:` for the specs that day closed, `blocked:` for what stands in a project's way, and `today:`
 * for what has happened since midnight.
 */
function formatTodo(todo, now = new Date()) {
  const scope = todo.category ? ` · ${todo.category}` : ''
  const head = todo.leftOff
    ? `todo: left off ${todo.leftOff.label || todo.leftOff.day} · today ${todo.todayLabel || ''}`.trimEnd()
    : `todo: nothing in the last ${todo.lookbackDays} days · today ${todo.todayLabel || ''}`.trimEnd()
  const out = [`${head}${scope}`]
  if (todo.projects.length === 0) out.push('  nothing in flight.')
  for (const p of todo.projects) {
    out.push('', `${p.name}${p.here ? ' (here)' : ''}${p.repo ? `  (${p.repo})` : ''}`)
    for (const g of p.groups) {
      out.push(`  ${g.spec ? `${g.spec}${g.ticket ? ` [${g.ticket.id}]` : ''}` : `${g.branch || '(no branch)'} — no spec`}`)
      if (g.left) out.push(`    left: ${g.left}`)
      if (g.prompt) out.push(`    - ${g.prompt}`)
      if (g.inFlight) out.push(`    in flight: ${g.inFlight.detail}${g.inFlight.next ? ` · next: ${g.inFlight.next}` : ''}`)
    }
    if (p.finished.length) out.push(`  finished: ${p.finished.join(', ')}`)
    for (const b of p.blocked) out.push(`  blocked: ${blockedText(b, now)}`)
    if (p.ideas) out.push(`  ideas: ${p.ideas} waiting · /spec-idea lists them`)
    if (p.today.commits || p.today.moves) {
      const parts = [p.today.commits && `${p.today.commits} commit${p.today.commits === 1 ? '' : 's'}`, p.today.moves && `${p.today.moves} move${p.today.moves === 1 ? '' : 's'}`]
      out.push(`  today: ${parts.filter(Boolean).join(', ')}`)
    }
  }
  for (const n of todo.notes) out.push('', n)
  return out.join('\n') + '\n'
}

module.exports = { LOOKBACK_DAYS, activityTimes, lastActiveDay, leftOf, blockersFrom, readBlockers, buildTodo, formatTodo, blockedText }
