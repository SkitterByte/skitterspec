'use strict'

/**
 * `spec-env review serve` — every spec's diff on one local HTTP server,
 * **rendered per request**.
 *
 * The page-on-disk path (`spec-env review <spec>`) writes a photograph of one
 * moment: true when it was taken, and overwritten by the next render. A served
 * page cannot be out of date, because there is no artefact between the git
 * objects and the response. That is the whole reason this exists, and it is why
 * nothing here reads or writes `.spec-env/reviews/` — the file path and the
 * served path are two answers to the same question, and keeping them
 * independent is what stops one quietly becoming the other's cache.
 *
 * Dependency-free, in the shape of `proxy.js`: pure functions for routing and
 * the index, an injectable render callback, and a `require.main` entry point so
 * the CLI can supervise it as a detached process exactly as it supervises the
 * proxy.
 */

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const {
  liveWorktreePaths,
  allSpecs,
  resolveSpec,
  resolveBaseBranch,
} = require('./resolve.js')
const { loadEnvConfig } = require('./config.js')
const {
  rawGitReader,
  collectReview,
  renderReviewPage,
  renderReviewBlock,
  reviewOutPath,
  validateNotesBlob,
  readPending,
  writePending,
  addPending,
} = require('./review.js')

/**
 * A random path prefix, minted only when binding beyond loopback.
 *
 * An unguessable path is the whole guard: bound to 0.0.0.0 the server is
 * reachable by anything on the network, and a diff of unreleased work is not
 * something to hand to whoever else is on the coffee-shop wifi. 48 bits from
 * `crypto` — not `Math.random`, which is seeded predictably enough to enumerate.
 */
function mintToken() {
  return crypto.randomBytes(6).toString('hex')
}

/**
 * Parse a request URL into what to serve. PURE — no git, no fs, no server.
 *
 * With a token, every path must carry it as the first segment. A wrong or
 * missing token is `notfound`, never a redirect: a redirect would confirm the
 * server is here to anybody probing ports, which is the one thing the token is
 * bought to prevent.
 */
function routeFor(url, { token = null } = {}) {
  const [rawPath, rawQuery] = String(url || '/').split('?')
  const query = new URLSearchParams(rawQuery || '')
  let segments = rawPath.split('/').filter(Boolean).map(decodeURIComponent)

  if (token) {
    if (segments[0] !== token) return { kind: 'notfound' }
    segments = segments.slice(1)
  }

  if (segments.length === 0) return { kind: 'index' }
  if (segments.length > 1) return { kind: 'notfound' }

  // `?branch` and `?branch=1` both mean the whole-spec view; `?branch=0` does
  // not, so a link can turn it off as well as on.
  const raw = query.get('branch')
  const branch = raw !== null && raw !== '0' && raw !== 'false'
  return { kind: 'spec', spec: segments[0], branch }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}

/**
 * The index page. PURE — takes already-resolved entries and returns HTML.
 *
 * Deliberately plain: the diff page is the designed surface, and this is a
 * doorway. It carries the same theme handling as the page template (a light
 * palette on bare `:root`, redefined under `prefers-color-scheme`) so the two
 * do not disagree when opened side by side.
 */
function renderIndex(entries, { token = null } = {}) {
  const prefix = token ? `/${token}` : ''
  const rows = entries
    .map((e) => {
      const t = e.totals || { files: 0, additions: 0, deletions: 0 }
      return (
        `<li><a href="${prefix}/${encodeURIComponent(e.folder)}">${escapeHtml(e.folder)}</a>` +
        `<span class="b">${escapeHtml(e.branch || '')}</span>` +
        `<span class="n">${t.files} file${t.files === 1 ? '' : 's'}</span>` +
        `<span class="a">+${t.additions}</span><span class="d">-${t.deletions}</span>` +
        `<a class="w" href="${prefix}/${encodeURIComponent(e.folder)}?branch=1">whole spec</a></li>`
      )
    })
    .join('\n')

  // An empty list is an ordinary state — no spec has a worktree yet — and says
  // so rather than rendering a bare page that reads as a failure.
  const body = entries.length
    ? `<ul>\n${rows}\n</ul>`
    : '<p class="empty">No spec has a worktree. Run <code>/spec-start &lt;name&gt;</code> to provision one.</p>'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>spec diffs</title>
<style>
:root { --bg:#fff; --fg:#1a1a1a; --dim:#6b6b6b; --line:#e3e3e3; --add:#0a7b34; --del:#b3261e; --link:#0b5fbd }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg:#16181c; --fg:#e6e6e6; --dim:#9a9a9a; --line:#2c2f36; --add:#4ec97a; --del:#ff7b72; --link:#7cb7ff }
}
* { box-sizing:border-box }
body { margin:0; padding:2rem 1.25rem; background:var(--bg); color:var(--fg);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif }
main { max-width:52rem; margin:0 auto }
h1 { font-size:1.1rem; margin:0 0 1.25rem; font-weight:600 }
ul { list-style:none; margin:0; padding:0 }
li { display:flex; flex-wrap:wrap; gap:.75rem; align-items:baseline;
  padding:.7rem 0; border-top:1px solid var(--line) }
a { color:var(--link); text-decoration:none; font-weight:600 }
a:hover { text-decoration:underline }
.b { color:var(--dim); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.85em }
.n { color:var(--dim); margin-left:auto }
.a { color:var(--add) } .d { color:var(--del) }
.w { font-weight:400; font-size:.85em }
.empty { color:var(--dim) }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace }
</style>
</head>
<body>
<main>
<h1>spec diffs</h1>
${body}
</main>
</body>
</html>
`
}

/**
 * Resolve the specs worth listing: every spec with a worktree of its own.
 *
 * A spec with no worktree is OMITTED, not listed as an error. An unstarted spec
 * has nothing to diff, which is the ordinary state of most of `specs/` — and a
 * doorway that lists them as failures would be wrong about a healthy repo.
 */
function servableSpecs(dir, config, git) {
  const worktreePaths = liveWorktreePaths(git)
  return allSpecs(dir, config, worktreePaths)
    .filter((s) => {
      const wt = s.worktreePath
      return wt && wt !== dir && worktreePaths.has(path.resolve(wt))
    })
    .sort((a, b) => a.folder.localeCompare(b.folder))
}

/**
 * Render one spec's page, now. Returns null when the spec has no worktree —
 * there is nothing to diff, and that is a 404 rather than an error page.
 *
 * `mode`/`ref` follow the same rules the CLI applies, including the clean-tree
 * fallback: a committed phase shows the branch range rather than an empty page.
 */
/**
 * Take a review pass for one spec and put it in the holding area. Returns the
 * code that claims it, or an error to relay verbatim.
 *
 * IT WRITES ONE FILE, and it is not the review. Everything a POST can reach is
 * the pending store; the sidecar the review actually reads is only ever written
 * by a claim, which needs a person to read six digits off the screen. That is
 * the whole containment, and it is why this endpoint can be open to the network
 * at all.
 *
 * The `render` field keys superseding: a second pass from the same page render
 * replaces the first unclaimed one, so the code on the screen is always the
 * pass on the screen. It comes from the blob's own `generatedAt`, which the
 * page mints per render — absent, the pass simply never supersedes anything,
 * which is the harmless direction.
 */
function receivePass(dir, config, spec, blob) {
  if (!spec || !fs.existsSync(spec.worktreePath)) return null
  let parsed
  try {
    parsed = validateNotesBlob(blob, spec.folder)
  } catch (err) {
    // The engine's own message, relayed rather than paraphrased — it names the
    // entry that was wrong, so there is nothing for the reader to guess.
    return { error: err.message }
  }
  const out = reviewOutPath(dir, spec.folder, null)
  const read = readPending(out, spec.folder)
  if (read.corrupt) {
    // Refuse rather than write over passes we could not read. Same rule the
    // notes sidecar follows, for the same reason: what is in there is someone's
    // work and overwriting it is unrecoverable.
    return { error: 'the pending store is not readable JSON — move it aside' }
  }
  const added = addPending(read.pending, {
    blob,
    at: new Date().toISOString(),
    render: blob && blob.generatedAt ? String(blob.generatedAt) : null,
  })
  writePending(out, added.pending)
  return { code: added.code, accepted: parsed.accepted.length, comments: parsed.comments.length }
}

function renderSpecPage(dir, config, spec, { branch = false } = {}) {
  if (!spec || !fs.existsSync(spec.worktreePath)) return null

  const git = rawGitReader(spec.worktreePath)
  const trimmed = (argv) => {
    const out = git(argv)
    return out == null ? null : String(out).trim() || null
  }
  const base = () => spec.baseRef || resolveBaseBranch(config, trimmed)

  const now = new Date().toISOString()
  let mode = 'working'
  let ref = 'HEAD'
  let baseName = null
  let fellBack = false

  if (branch) {
    baseName = base()
    const mergeBase = trimmed(['merge-base', baseName, 'HEAD'])
    if (!mergeBase) return { html: null, error: `no merge-base between ${baseName} and HEAD` }
    ref = mergeBase
    mode = 'branch'
  }

  let data = collectReview({ spec, git, mode, ref, base: baseName, now })

  if (!branch && data.totals.files === 0) {
    const fallbackBase = base()
    const mergeBase = trimmed(['merge-base', fallbackBase, 'HEAD'])
    if (mergeBase) {
      const wider = collectReview({
        spec,
        git,
        mode: 'branch',
        ref: mergeBase,
        base: fallbackBase,
        now,
        fellBack: true,
      })
      if (wider.totals.files > 0) {
        data = wider
        fellBack = true
      }
    }
  }

  return {
    html: renderReviewPage(data, { reviewHtml: renderReviewBlock(data.review) }),
    totals: data.totals,
    mode: data.mode,
    fellBack,
  }
}

/**
 * Counts for the index, without building a single patch.
 *
 * The index shows three numbers per spec, and `collectReview` would produce
 * them as a by-product of splicing every patch of every spec — making the
 * doorway far and away the most expensive page here. `--numstat` answers the
 * same question in one call per spec; untracked files are counted separately
 * because `git diff` cannot see them.
 */
function specSummary(spec) {
  if (!spec || !fs.existsSync(spec.worktreePath)) return null
  const git = rawGitReader(spec.worktreePath)

  const totals = { files: 0, additions: 0, deletions: 0 }
  const add = (row) => {
    const [a, d] = row.split('\t')
    totals.files += 1
    // A binary file reports `-` for both; count the file, never guess its lines.
    if (a === '-' || d === '-') return
    totals.additions += Number(a) || 0
    totals.deletions += Number(d) || 0
  }

  for (const row of String(git(['diff', '--numstat', 'HEAD']) || '')
    .split('\n')
    .filter(Boolean)) {
    add(row)
  }

  // `git diff` cannot see untracked files, so each is measured the same way the
  // page measures it — against /dev/null. One process per untracked file is what
  // the page already pays; the index matching it exactly is worth more than the
  // processes saved, because two different numbers for the same spec is a bug
  // report waiting to happen.
  for (const f of String(git(['ls-files', '--others', '--exclude-standard']) || '')
    .split('\n')
    .filter(Boolean)) {
    const row = String(git(['diff', '--numstat', '--no-index', '/dev/null', f]) || '')
      .split('\n')
      .filter(Boolean)[0]
    if (row) add(row)
    else totals.files += 1
  }

  return totals
}

/**
 * Build (but do not listen on) the server. `resolveEntries` and `render` are
 * injected so this can be driven in a test without a git fixture, and so the
 * module never has to reach back into the CLI.
 */
// A review pass is JSON written by a person, not a payload. Ten megabytes is
// far past any real review and far short of anything that could hurt — the cap
// exists so a body is REFUSED BEFORE IT IS PARSED, not so a number is tuned.
const MAX_PASS_BYTES = 1_000_000

/**
 * Read a request body, refusing anything over the cap without buffering it all.
 *
 * The check is per-chunk rather than on the finished body: a cap applied after
 * the fact has already done the thing it was meant to prevent.
 */
function readBody(req, limit = MAX_PASS_BYTES) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      resolve(value)
    }
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        req.destroy()
        return finish({ error: 'too large' })
      }
      chunks.push(c)
    })
    req.on('end', () => finish({ body: Buffer.concat(chunks).toString('utf8') }))
    req.on('error', () => finish({ error: 'read failed' }))
  })
}

function createReviewServer({ resolveEntries, render, receive = null, token = null }) {
  return http.createServer((req, res) => {
    const send = (code, body, type = 'text/html; charset=utf-8') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
      res.end(body)
    }

    const route = routeFor(req.url, { token })
    if (route.kind === 'notfound') return send(404, 'not found', 'text/plain; charset=utf-8')

    // THE ONE WRITE PATH, and it writes to a holding area rather than to the
    // review. What a stranger on the network can do with it is queue a pass
    // that nobody will claim; the code is what decides whether it ever counts.
    if (req.method === 'POST') {
      // A write to the index is not a write to a spec, and answering it any
      // differently from a GET would make this route an enumeration oracle.
      if (route.kind !== 'spec' || !receive) {
        return send(404, 'not found', 'text/plain; charset=utf-8')
      }
      readBody(req).then((read) => {
        if (read.error) return send(413, read.error, 'text/plain; charset=utf-8')
        let parsed
        try {
          parsed = JSON.parse(read.body)
        } catch {
          return send(400, 'not JSON', 'text/plain; charset=utf-8')
        }
        // The engine's own validator, and its own message. A pass arriving here
        // is exactly as untrusted as one arriving through a clipboard.
        const out = receive(route.spec, parsed)
        if (!out) return send(404, 'not found', 'text/plain; charset=utf-8')
        if (out.error) return send(422, out.error, 'text/plain; charset=utf-8')
        return send(200, JSON.stringify({ code: out.code }), 'application/json; charset=utf-8')
      })
      return
    }

    try {
      if (route.kind === 'index') return send(200, renderIndex(resolveEntries(), { token }))
      const out = render(route.spec, { branch: route.branch })
      if (!out) return send(404, 'not found', 'text/plain; charset=utf-8')
      if (out.error) return send(409, out.error, 'text/plain; charset=utf-8')
      return send(200, out.html)
    } catch (err) {
      // A render that throws is one spec's problem, not the server's — say so
      // and stay up, so the other specs remain readable.
      return send(500, `render failed: ${err.message}`, 'text/plain; charset=utf-8')
    }
  })
}

function startReviewServer(server, { port, host = '127.0.0.1' }) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve(server.address()))
  })
}

/**
 * The version of the package that OWNS a script — walk up to the nearest
 * `package.json` from the script's own directory.
 *
 * WHY NOT just report the running CLI's version: the CLI and the daemon are
 * routinely DIFFERENT PACKAGES. A superset distribution exposes the
 * `skitterspec` binary from its own package while `daemonScript` resolves the
 * daemon out of `node_modules/@skitterbyte/skitterspec`, so comparing one
 * against the other reports a mismatch that is never true and never goes away —
 * which, wired to a restart, is a server replaced on every single render.
 * Resolving from the script means both halves of the comparison are the same
 * question asked at two different times.
 *
 * Returns `null` rather than throwing or guessing. An unreadable package, an
 * absent one, a `version` that is not a string: each is a state where the
 * lookup could not see, and `staleServer` routes all of them to `unknown`.
 */
function engineVersionFor(scriptPath) {
  if (!scriptPath) return null
  let dir = path.dirname(path.resolve(scriptPath))
  // Bounded: stop at the filesystem root rather than trusting a break.
  for (let i = 0; i < 40; i++) {
    const candidate = path.join(dir, 'package.json')
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
      if (typeof parsed.version === 'string' && parsed.version) return parsed.version
      return null
    } catch {}
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
  return null
}

/**
 * Is the running server executing the engine this one would start? Pure.
 *
 * THREE STATES, NOT TWO (`.claude/rules/negative-checks.md` rule 4). The third
 * is what this whole feature turns on: a server that recorded no version — every
 * server started before this shipped — is not stale, it is UNANSWERABLE, and the
 * caller must route it to inaction. Reading a missing record as "different, so
 * stale" would restart every healthy server on the first render after upgrading,
 * which is the accusation this check exists to avoid making.
 *
 * WHAT WOULD BLIND THIS: `recorded` is absent on a pre-feature server, and
 * `running` is null whenever `engineVersionFor` could not read a package at all
 * (a bundled build, an odd install layout). Both are answered `unknown`, and
 * neither is evidence of anything.
 */
function staleServer(recorded, running) {
  if (typeof recorded !== 'string' || !recorded) return 'unknown'
  if (typeof running !== 'string' || !running) return 'unknown'
  return recorded === running ? 'current' : 'stale'
}

module.exports = {
  mintToken,
  readBody,
  MAX_PASS_BYTES,
  engineVersionFor,
  staleServer,
  specSummary,
  routeFor,
  renderIndex,
  servableSpecs,
  renderSpecPage,
  receivePass,
  createReviewServer,
  startReviewServer,
}

// Entry point: run detached by the CLI, reading its settings from a file so a
// restart is a rewrite of that file — the same contract `proxy.js` uses. Only
// `dir` is stored, never a snapshot of the specs: resolving per request is what
// keeps a spec provisioned after the server started from being invisible to it.
if (require.main === module) {
  const settingsFile = process.argv[2]
  if (!settingsFile) {
    process.stderr.write('serve: usage: node serve.js <settingsFile>\n')
    process.exit(1)
  }
  const { dir, port, host, token } = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
  const { config } = loadEnvConfig(dir)
  const git = rawGitReader(dir)
  const trimmedGit = (argv) => {
    const out = git(argv)
    return out == null ? null : String(out).trim() || null
  }

  const resolveOne = (folder) => {
    try {
      return resolveSpec(folder, dir, config, { searchDirs: [...liveWorktreePaths(trimmedGit)] })
    } catch {
      return null
    }
  }

  const resolveEntries = () =>
    servableSpecs(dir, config, trimmedGit).map((s) => {
      const one = resolveOne(s.folder)
      return {
        folder: s.folder,
        branch: one ? one.branch : '',
        totals: specSummary(one),
      }
    })

  const server = createReviewServer({
    resolveEntries,
    render: (folder, opts) => renderSpecPage(dir, config, resolveOne(folder), opts),
    receive: (folder, blob) => receivePass(dir, config, resolveOne(folder), blob),
    token,
  })
  startReviewServer(server, { port, host }).then(
    () => {},
    (err) => {
      process.stderr.write(`serve: ${err.message}\n`)
      process.exit(1)
    },
  )
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
