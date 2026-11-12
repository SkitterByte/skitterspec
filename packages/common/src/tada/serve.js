'use strict'

/**
 * The ta-da page as the review server serves it: `/<token>/_tada?on=…`,
 * rendered per request like every other page there. Nothing is stored but the
 * model's recap, a sidecar beside the review notes — the HTML never is, for
 * the reason `env/serve.js` gives: a stored page is a photograph, and a
 * served one cannot be out of date.
 *
 * The digest is the CLI's own answer (`skitterspec tada --json`), run in the
 * server's project so its category scopes the report exactly as it would in a
 * terminal there. One implementation, so the page and the terminal cannot
 * disagree about what the day held.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

const { windowFor, humanLabel, localDay } = require('./window.js')
const { renderTadaPage } = require('./page.js')

// `_tada`, not `tada`: the route shares a namespace with spec names, and a
// `/no-spec` branch may be called anything kebab-case — never with a leading
// underscore.
const ROUTE = '_tada'

const BIN = path.join(__dirname, '..', '..', 'bin', 'skitterspec.js')

/**
 * What a request (or a CLI run) asks for, in one shape: the window as an
 * absolute day so a link keeps meaning the same thing tomorrow, and the
 * scope flags. `since` and `on` are both day strings (`YYYY-MM-DD`) or absent.
 */
function tadaQuery({ on = null, since = null, all = false, chat = false, here = false } = {}) {
  const q = new URLSearchParams()
  if (on) q.set('on', on)
  else if (since) q.set('since', since)
  if (all) q.set('all', '1')
  if (chat) q.set('chat', '1')
  if (here) q.set('here', '1')
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** The query back into a request — refusing a window it cannot read. */
function readTadaQuery(search, now = new Date()) {
  const q = new URLSearchParams(search || '')
  const on = q.get('on')
  const since = q.get('since')
  const window = windowFor({ on: on || undefined, since: since || undefined }, now)
  const flag = (k) => ['1', 'true', ''].includes(q.get(k)) && q.has(k)
  return { on, since, all: flag('all'), chat: flag('chat'), here: flag('here'), window }
}

/**
 * The recap sidecar's name. Keyed by the window's START and kind, never its
 * end: `--since friday` runs to now, so an end-keyed recap would be lost the
 * next morning while the link that names it still works.
 */
function recapKey({ on, since, window, all, chat }) {
  const kind = on ? 'on' : since ? 'since' : 'on'
  return `${kind}-${localDay(window.since)}${all ? '-all' : ''}${chat ? '-chat' : ''}`
}

function recapPath(stateDir, key) {
  return path.join(stateDir, 'tada', `${key}.md`)
}

/** The CLI's digest for one window, run where the server's project lives. */
function runDigest({ dir, ask, exec = execFile, bin = BIN }) {
  const args = [bin, 'tada', '--json']
  const day = localDay(ask.window.since)
  if (ask.on) args.push('--on', day)
  else if (ask.since) args.push('--since', day)
  if (ask.all) args.push('--all-projects')
  if (ask.chat) args.push('--chat')
  // `--here` in the server's own project: the repo the page was asked for.
  if (ask.here) args.push('--here')
  return new Promise((resolve) => {
    exec(process.execPath, args, { cwd: dir, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ error: `cannot tell — the digest could not be built (${err.message.split('\n')[0]})` })
      try {
        resolve({ digest: JSON.parse(stdout) })
      } catch {
        resolve({ error: 'cannot tell — the digest was not readable' })
      }
    })
  })
}

/**
 * The route's whole answer: `{ html }`, or `{ status, error }` for the server
 * to send as text. A window it cannot read is a 400 naming the fix — the
 * server never guesses a day.
 */
async function renderServedTada({ dir, stateDir, search, project = null, now = new Date(), run = runDigest }) {
  let ask
  try {
    ask = readTadaQuery(search, now)
  } catch (e) {
    return { status: 400, error: e.message }
  }
  const out = await run({ dir, ask })
  if (out.error) return { status: 500, error: out.error }
  let recap = null
  let writtenAt = null
  try {
    const file = recapPath(stateDir, recapKey(ask))
    recap = fs.readFileSync(file, 'utf8')
    writtenAt = fs.statSync(file).mtime
  } catch {
    // No recap saved for this window is an ordinary state: the page is the
    // digest alone, which is still the day's facts.
  }
  return {
    html: renderTadaPage(out.digest, {
      recap,
      writtenAt,
      title: `Ta-da · ${humanLabel(ask.window)}`,
      project,
      category: out.digest.category || null,
    }),
  }
}

module.exports = { ROUTE, tadaQuery, readTadaQuery, recapKey, recapPath, renderServedTada, runDigest }
