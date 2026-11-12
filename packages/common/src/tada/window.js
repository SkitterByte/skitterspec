'use strict'

/**
 * The window a ta-da list covers — local time, because "today" is the
 * reader's day and not UTC's. `--since <when>` runs from that day to now;
 * `--on <when>` is that one day. Both read the same `<when>`:
 *
 *   named      today · yesterday · friday · last friday · last week
 *   relative   3 days ago · 3d · 2 weeks ago · 2w
 *   a date     2026-11-06 · 6 Nov · Nov 6 · 6 November 2026
 *
 * Pure: `now` is injected, so every shape is pinned without a clock.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const GRAMMAR = 'today, yesterday, a weekday (last friday), N days/weeks ago (3d, 2w), or a date (2026-11-06, 6 Nov)'

function daysBefore(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)
}

// A name or its first three letters; `sept` is accepted for September.
function lookup(names, word) {
  const w = word.toLowerCase()
  const i = names.findIndex((n) => n === w || n.slice(0, 3) === w)
  if (i !== -1) return i
  return w === 'sept' && names === MONTHS ? 8 : -1
}

function exactDate(year, month, day, value) {
  const d = new Date(year, month, day)
  // `new Date` rolls 31 Feb over into March rather than refusing it.
  if (d.getMonth() !== month || d.getDate() !== day) throw new Error(`no such date: ${value}`)
  return d
}

/**
 * @param {string|undefined} value
 * @param {Date} now
 * @returns {Date} the local midnight the day begins at
 * @throws on a value it cannot read — a window guessed from a typo would
 *   report the wrong day with total confidence
 */
function parseWhen(value, now = new Date()) {
  const raw = (value || 'today').trim()
  const v = raw.toLowerCase().replace(/\s+/g, ' ')
  const today = daysBefore(now, 0)
  let d = null

  if (v === 'today') d = today
  else if (v === 'yesterday') d = daysBefore(now, 1)
  else if (v === 'last week' || v === 'a week ago') d = daysBefore(now, 7)

  // A weekday is the most recent PAST one, so it is never more than a week
  // back: `friday` on a Monday is three days back, and `monday` on a Monday is
  // seven — on the day itself, "since monday" meaning today would be `today`
  // spelled oddly. `last friday` says the same thing in more words.
  if (!d) {
    const m = /^(?:last )?([a-z]+)$/.exec(v)
    const day = m ? lookup(WEEKDAYS, m[1]) : -1
    if (day !== -1) d = daysBefore(now, (now.getDay() - day + 7) % 7 || 7)
  }

  if (!d) {
    const m = /^(\d+|an?) ?(d|days?|w|weeks?)(?: ago)?$/.exec(v) || /^-(\d+)(d|w)$/.exec(v)
    if (m) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
      d = daysBefore(now, m[2].startsWith('w') ? n * 7 : n)
    }
  }

  if (!d) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    if (iso) d = exactDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), raw)
  }

  if (!d) {
    // `6 Nov`, `Nov 6`, either with a year. Without one it is the most recent
    // such date — `20 Dec` read in January means last December.
    const dm = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+),? ?(\d{4})?$/.exec(v)
    const md = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? ?(\d{4})?$/.exec(v)
    const parts = dm ? { day: dm[1], month: dm[2], year: dm[3] } : md ? { day: md[2], month: md[1], year: md[3] } : null
    const month = parts ? lookup(MONTHS, parts.month) : -1
    if (month !== -1) {
      if (parts.year) d = exactDate(Number(parts.year), month, Number(parts.day), raw)
      else {
        d = exactDate(now.getFullYear(), month, Number(parts.day), raw)
        if (d > today) d = exactDate(now.getFullYear() - 1, month, Number(parts.day), raw)
      }
    }
  }

  if (!d && /^\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?$/.test(v)) {
    // 11/12 is the 11th of December in London and the 12th of November in New
    // York. Picking one is the confident wrong answer this refuses to give.
    throw new Error(`${raw} reads two ways (day/month or month/day) — write 2026-11-12 or 12 Nov`)
  }
  if (!d) throw new Error(`expected ${GRAMMAR} — got: ${raw}`)
  if (d > today) throw new Error(`${raw} is in the future`)
  return d
}

/**
 * @param {{ since?: string, on?: string }} when
 * @returns {{ since: Date, until: Date }}
 */
function windowFor({ since, on } = {}, now = new Date()) {
  if (since && on) throw new Error('--since and --on together name two windows — pick one')
  if (on) {
    const start = parseWhen(on, now)
    const end = daysBefore(start, -1)
    return { since: start, until: end < now ? end : now }
  }
  return { since: parseWhen(since, now), until: now }
}

const localDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The window as the reader's own dates — one day, or `first → last`. The
 * digest's timestamps are UTC instants; a label is not, or `--on 10 Nov` read
 * east of Greenwich would be named the 9th.
 */
function windowLabel({ since, until }) {
  const last = new Date(until.getTime() - 1) // an `--on` window ends at the next midnight, exclusive
  const a = localDay(since)
  const b = localDay(last < since ? since : last)
  return a === b ? a : `${a} → ${b}`
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * The window as a person writes dates: `Thursday 12 November 2026` for one
 * day, `Fri 6 – Thu 12 Nov 2026` for a span — the month and year said once
 * when the two ends share them, and both times when they do not.
 */
function humanLabel({ since, until }) {
  const last = new Date(until.getTime() - 1)
  const end = last < since ? since : last
  if (localDay(since) === localDay(end)) {
    return `${DAY_NAMES[since.getDay()]} ${since.getDate()} ${MONTH_NAMES[since.getMonth()]} ${since.getFullYear()}`
  }
  const short = (d) => `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()}`
  const month = (d) => MONTH_NAMES[d.getMonth()].slice(0, 3)
  const sameYear = since.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && since.getMonth() === end.getMonth()
  const from = sameMonth ? short(since) : `${short(since)} ${month(since)}${sameYear ? '' : ` ${since.getFullYear()}`}`
  return `${from} – ${short(end)} ${month(end)} ${end.getFullYear()}`
}

module.exports = { parseWhen, windowFor, windowLabel, humanLabel, localDay, GRAMMAR }
