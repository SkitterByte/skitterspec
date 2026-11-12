'use strict'

/**
 * The window a ta-da list covers — local time, because "today" is the
 * reader's day and not UTC's. `--since` takes `today` (the default),
 * `yesterday`, a weekday name, or `YYYY-MM-DD`; the window always runs to now.
 *
 * Pure: `now` is injected, so every shape is pinned without a clock.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function midnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBefore(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)
}

/**
 * @param {string|undefined} value  the `--since` argument
 * @param {Date} now
 * @returns {Date} the local midnight the window opens at
 * @throws on a value it cannot read — a window guessed from a typo would
 *   report the wrong day with total confidence
 */
function parseSince(value, now = new Date()) {
  const v = (value || 'today').trim().toLowerCase()
  if (v === 'today') return midnight(now)
  if (v === 'yesterday') return daysBefore(now, 1)

  // A weekday is the most recent PAST one: `--since friday` on a Monday is
  // three days back, and `--since monday` on a Monday is a week back — on the
  // day itself, "since monday" meaning "today" would be `today` spelled oddly.
  const day = WEEKDAYS.findIndex((w) => w === v || w.slice(0, 3) === v)
  if (day !== -1) {
    const back = (now.getDay() - day + 7) % 7 || 7
    return daysBefore(now, back)
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    // `new Date` rolls 2026-02-31 over into March rather than refusing it.
    if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
      throw new Error(`--since: no such date: ${value}`)
    }
    if (d > now) throw new Error(`--since: ${value} is in the future`)
    return d
  }

  throw new Error(`--since: expected today, yesterday, a weekday or YYYY-MM-DD — got: ${value}`)
}

/** @returns {{ since: Date, until: Date }} */
function windowFor(value, now = new Date()) {
  return { since: parseSince(value, now), until: now }
}

module.exports = { parseSince, windowFor }
