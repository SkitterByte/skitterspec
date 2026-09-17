'use strict'

/**
 * `spec-env review serve` — every spec's diff on one local HTTP server,
 * **rendered per request**.
 *
 * The page-on-disk path (`spec-env review <spec>`) writes a photograph of one
 * moment: true when it was taken, and overwritten by the next render. A served
 * page cannot be out of date, because there is no artefact between the git
 * objects and the response. That is the whole reason this exists, and it is why
 * no HTML is read from or written to `.spec-env/reviews/` — the file path and
 * the served path are two answers to the same question, and keeping the
 * artefacts independent is what stops one quietly becoming the other's cache.
 *
 * THE SIDECARS ARE A DIFFERENT MATTER, and this once over-applied the rule
 * above to them. Notes, the gate and the pending store are the REVIEW'S state,
 * not the page's: they belong to whoever is reading, and a reader on a phone is
 * reading this page. So they are read here (and, for a pass arriving, written)
 * — which is what makes a refresh keep your accepts and the history line say
 * what happened. What is never read here is a rendered page.
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
const { specDocsIn } = require('./classify.js')
const { liveStateFor } = require('./live.js')
const {
  rawGitReader,
  collectReview,
  renderReviewPage,
  renderReviewBlock,
  reviewOutPath,
  validateNotesBlob,
  readPending,
  passState: readPassState,
  writePending,
  addPending,
  readNotes,
  readGate,
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

  // `?pass=<code>` asks what became of ONE pass, and it is checked BEFORE
  // `?branch` because it is not a view of the diff at all — it is the page
  // finding out whether the verdict it sent was picked up. Deliberately only
  // ever one code wide: a route that listed what is waiting would hand a
  // prober exactly what the six digits are bought to withhold, and the POST
  // route was kept from being that oracle for the same reason.
  const pass = query.get('pass')
  if (pass !== null) return { kind: 'pass', spec: segments[0], code: pass }

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
 * WHICH VIEW A SPEC GETS, decided in one place so every route agrees.
 *
 * `worktree` — it has one, so the page is its branch's diff, exactly as before.
 * `docs` — it has none, so the page is its own uncommitted documents read from
 *   the checkout this server is anchored to. That is the authoring page
 *   `spec-env review --docs` writes, and this is what lets it be SERVED: a
 *   `file://` page has no server to POST to, so without this the authoring page
 *   exists and its verdict buttons have nowhere to go.
 * `null` — neither: no worktree and nothing uncommitted of its own, which is
 *   the ordinary state of most of `specs/` and a 404 rather than an error.
 *
 * WHAT WOULD FOOL A WORKTREE-ONLY VERSION of this — which is what shipped, and
 * what 404'd a page rendered minutes earlier: an authoring page belongs to a
 * spec with no worktree BY DEFINITION, so gating the route on a worktree
 * excludes precisely the specs the docs view exists for.
 */
function viewFor(dir, config, spec, git, { fallback = false } = {}) {
  if (!spec) return null
  // LIVE COMES FIRST, because while a spec is live its worktree still exists —
  // detached — and would win the check below while holding none of the work.
  // `live take` checks the branch out HERE, and a fix made while live is made
  // here too, so this checkout is the tree that answers.
  if (spec.branch && headBranchOf(git) === spec.branch) return { kind: 'live', tree: dir }
  const wt = spec.worktreePath
  if (wt && wt !== dir && fs.existsSync(wt)) return { kind: 'worktree', tree: wt }
  const found = specDocsIn(dir, spec, config, trimmedGitReader(dir))
  // `error` is cannot-tell — not a page, and not an error page either (rule 4:
  // the harmless branch).
  if (found.error) return null
  if (!found.empty) return { kind: 'docs', tree: found.tree, owned: found.owned }

  // NOTHING UNCOMMITTED IS NOT NOTHING TO SHOW, on this route. A `--docs` page
  // renders a spec's uncommitted documents, so HONOURING THE VERDICT PRESSED ON
  // IT is what removes them: the reader presses `Commit`, the agent commits, and
  // a reload 404s. The link was valid, the server was up and the network was
  // fine — the page had been deliberately destroyed by the thing it asked for.
  //
  // So fall back to what the spec now IS, which mirrors the phase page's
  // clean-tree fallback for the same reason: the page is rendered before the
  // commit and read after it.
  //
  // ONLY FOR A NAMED PAGE, never for the index. The two routes ask different
  // questions: the index is a menu of what AWAITS review, and every completed
  // spec in the repo falling back would fill it with dozens of finished ones —
  // the doorway would be wrong about a healthy repo, which is the reason it
  // omits them in the first place. A direct request is someone opening an
  // address they were given, and that has to keep resolving.
  if (!fallback) return null
  const committed = committedDocsFor(dir, config, spec)
  if (!committed) return null
  return { kind: 'docs-committed', tree: dir, owned: committed }
}

/**
 * The spec's committed document paths at `HEAD`, or null when it has none.
 *
 * KEPT ONLY WHERE IT FINDS SOMETHING, exactly as the branch fallback is: a name
 * that is no spec at all must stay a 404 rather than render an empty page with
 * a commit button on it.
 */
function committedDocsFor(dir, config, spec) {
  const git = trimmedGitReader(dir)
  const out = git(['ls-files', '--', `specs/*/${spec.folder}/*`])
  if (out == null) return null
  const paths = String(out)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return paths.length ? paths : null
}

/**
 * The tier rows the PAGE needs, from config alone.
 *
 * DELIBERATELY NOT `reviewTierStack`. That stack answers "where can this be
 * read", which needs the server's bind, the machine's addresses and any
 * published URL. The page needs only the half it can act on: which tiers are
 * OFF, so it can offer the press that turns one on. An `off` tier has no URL by
 * definition, so none of that machinery is required — and an `on` tier
 * contributes nothing here, because the reader is standing on one of them.
 */
function pageTiers(config) {
  const r = (config && config.review) || {}
  return [
    { tier: 'network', off: !r.allowNetwork },
    { tier: 'remote', off: !r.allowRemote },
  ]
}

/**
 * The branch name a git reader's checkout is on, or null.
 *
 * NULL FOR A DETACHED HEAD, which `rev-parse --abbrev-ref` spells `HEAD` — a
 * name no branch has, and one that must never compare equal to a spec's.
 * Returning it verbatim would make a detached checkout look like a spec called
 * `HEAD`; the cannot-tell answer is null (`.claude/rules/negative-checks.md`).
 */
function headBranchOf(git) {
  const out = git ? git(['rev-parse', '--abbrev-ref', 'HEAD']) : null
  if (out == null) return null
  const name = String(out).trim()
  return name && name !== 'HEAD' ? name : null
}

// `specDocsIn` wants a reader that TRIMS, because it compares whole paths.
function trimmedGitReader(treePath) {
  const git = rawGitReader(treePath)
  return (argv) => {
    const out = git(argv)
    return out == null ? null : String(out).trim()
  }
}

/**
 * Resolve the specs worth listing: every spec this server can render a page for.
 *
 * A spec with neither a worktree nor uncommitted documents of its own is
 * OMITTED, not listed as an error — that is the ordinary state of most of
 * `specs/`, and a doorway listing them as failures would be wrong about a
 * healthy repo.
 *
 * IT INCLUDES WORKTREE-LESS SPECS NOW, and both halves are needed together: a
 * page that serves but is absent from the index is a page nobody finds.
 */
function servableSpecs(dir, config, git) {
  const worktreePaths = liveWorktreePaths(git)
  return allSpecs(dir, config, worktreePaths)
    .filter((s) => Boolean(viewFor(dir, config, s, git)))
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
  // A VIEW, NOT A WORKTREE. The pending store lives in the checkout this server
  // is anchored to, so accepting a pass needs no worktree — and requiring one
  // rejected every verdict sent from an authoring page, which is the one page
  // whose spec never has a worktree.
  // `fallback: true` so the POST follows the PAGE. A reader who reloads a
  // committed docs page gets buttons; rejecting what they press would be the
  // failure this whole area keeps producing — a control that appears to do
  // nothing. Whether the verdict is worth acting on is the routing's call.
  if (!spec || !viewFor(dir, config, spec, rawGitReader(dir), { fallback: true })) return null
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
  const view = viewFor(dir, config, spec, rawGitReader(dir), { fallback: true })
  if (!view) return null

  // THE DOCS VIEW IS A DIFFERENT TREE AND A DIFFERENT FILE SET, and it takes
  // the authoring buttons: a spec with no worktree has no phase in flight, so
  // "commit and build the next phase" is the wrong offer for it.
  if (view.kind === 'docs' || view.kind === 'docs-committed') {
    const docsGit = rawGitReader(view.tree)
    const out = reviewOutPath(dir, spec.folder, null)
    const notes = readNotes(out, spec.folder).notes
    const gateRead = readGate(out, spec.folder)
    const data = collectReview({
      spec,
      git: docsGit,
      mode: view.kind,
      // A committed view diffs against the commit BEFORE HEAD's spec content —
      // there is nothing uncommitted to compare, so the whole document is the
      // content, exactly as an untracked file renders.
      ref: view.kind === 'docs-committed' ? 'HEAD~1' : 'HEAD',
      now: new Date().toISOString(),
      notes,
      gate: gateRead.corrupt ? null : gateRead.gate,
      buttons: 'authoring',
      only: view.owned,
      treePath: view.tree,
    })
    return {
      html: renderReviewPage(data, { reviewHtml: renderReviewBlock(data.review) }),
      totals: data.totals,
      mode: data.mode,
      fellBack: false,
    }
  }

  // `view.tree` rather than `spec.worktreePath`: the two differ for a live
  // spec, whose branch is checked out here instead.
  const git = rawGitReader(view.tree || spec.worktreePath)
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

  // THE REVIEW STATE IS THE READER'S, not the artefact's. It was once left out
  // here on the reasoning that this path writes no file — but a reader on a
  // phone is reading THIS page, and without the sidecar their own accepts
  // vanish on every refresh and the history line never appears at all. The two
  // surfaces answered differently about the same review, which is worse than
  // either answer. Read-only: nothing on this path writes the sidecar.
  const out = reviewOutPath(dir, spec.folder, null)
  const notes = readNotes(out, spec.folder).notes
  const gateRead = readGate(out, spec.folder)
  // A corrupt gate contributes nothing rather than failing the render. The page
  // is a convenience and the gate is not what it is for.
  const gate = gateRead.corrupt ? null : gateRead.gate

  // WHERE ELSE THIS REVIEW LIVES, and whether it is also running — the block
  // above the verdicts. Worktree views only: a `--docs` page returns above,
  // because a spec with no branch has nothing to put live.
  const live = liveStateFor(spec, {
    isolated: true,
    onBase: headBranchOf(rawGitReader(dir)) !== spec.branch,
    primaryBranch: headBranchOf(rawGitReader(dir)),
    receipt: null,
    worktreeExists: Boolean(spec.worktreePath && fs.existsSync(spec.worktreePath)),
  })
  const tiers = pageTiers(config)

  let data = collectReview({
    spec,
    git,
    mode,
    ref,
    base: baseName,
    now,
    notes,
    gate,
    live,
    tiers,
  })

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
        notes,
        gate,
        live,
        tiers,
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
/**
 * Counts for a docs view: numstat over just this spec's owned paths.
 *
 * Untracked files are counted with `--no-index` against /dev/null, which is the
 * only way git will diff a file it does not track — and a brand-new spec is
 * entirely untracked, so without that half the index would show a spec with
 * four documents as `0 files`.
 */
function docsSummary(view) {
  const git = rawGitReader(view.tree)
  const totals = { files: 0, additions: 0, deletions: 0 }
  const add = (row) => {
    const [a, d] = String(row).split('\t')
    totals.files += 1
    if (a === '-' || d === '-') return
    totals.additions += Number(a) || 0
    totals.deletions += Number(d) || 0
  }
  for (const rel of view.owned) {
    const tracked = git(['diff', '--numstat', 'HEAD', '--', rel])
    const rows = String(tracked || '').split('\n').filter(Boolean)
    if (rows.length) {
      rows.forEach(add)
      continue
    }
    const untracked = git(['diff', '--no-index', '--numstat', '--', '/dev/null', rel])
    String(untracked || '')
      .split('\n')
      .filter(Boolean)
      .forEach(add)
  }
  return totals
}

function specSummary(spec, dir = null, config = null) {
  // The index counts whatever the page would show, so it takes the same view.
  // `dir`/`config` are optional so an existing caller counting a worktree spec
  // is unchanged; without them only the worktree view can be counted.
  const view = dir ? viewFor(dir, config, spec, rawGitReader(dir)) : null
  if (view && view.kind === 'docs') return docsSummary(view)
  // The tree the page would read, which for a live spec is this checkout. The
  // worktree fallback keeps the callers that pass no `dir` working unchanged.
  const tree = view && view.tree ? view.tree : spec && spec.worktreePath
  if (!tree || !fs.existsSync(tree)) return null
  const git = rawGitReader(tree)

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

function createReviewServer({ resolveEntries, render, receive = null, passState = null, token = null }) {
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

    // THE READ THAT IS NOT A RENDER. It answers three words and never a diff,
    // so a page polling it costs the server a file read rather than a patch.
    //
    // A SERVER BUILT WITHOUT THE LOOKUP SAYS SO, rather than 404ing or falling
    // through to the diff page. An older daemon still running beside a newer
    // page is the ordinary way here, and both of those answers would be read as
    // something they are not — a 404 as "that pass does not exist", HTML as a
    // parse failure. `unknown` is the one answer that keeps the command on the
    // reader's screen, which is where it belongs when nothing can be
    // established.
    if (route.kind === 'pass') {
      const out = passState ? passState(route.spec, route.code) : null
      const state = out && typeof out.state === 'string' ? out.state : 'unknown'
      return send(200, JSON.stringify({ state }), 'application/json; charset=utf-8')
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
function staleServer(recorded, running, recordedMtime, runningMtime) {
  if (typeof recorded !== 'string' || !recorded) return 'unknown'
  if (typeof running !== 'string' || !running) return 'unknown'
  if (recorded !== running) return 'stale'

  // SAME VERSION IS NOT SAME CODE, which is the whole of this addition. The
  // daemon runs a built copy of the engine — in this repo a symlink to the
  // gitignored dist — so a rebuild moves the file without moving the version,
  // and a version-only comparison adopted a process running last week's code.
  // It cost two confidently wrong diagnoses in one session: a page reported as
  // 404ing that the new code serves, and a regression reported as unfixed that
  // had already been fixed.
  //
  // CANNOT TELL ADOPTS. A settings file written before this existed records no
  // mtime, and an unreadable script has none to offer — restarting a healthy
  // server over an absent field is the destructive reading, so an absent half
  // falls back to the version verdict (rule 4).
  const both = Number.isFinite(recordedMtime) && Number.isFinite(runningMtime)
  if (both && recordedMtime !== runningMtime) return 'stale'
  return 'current'
}

module.exports = {
  mintToken,
  readBody,
  MAX_PASS_BYTES,
  engineVersionFor,
  staleServer,
  specSummary,
  viewFor,
  headBranchOf,
  pageTiers,
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
        totals: specSummary(one, dir, config),
      }
    })

  const server = createReviewServer({
    resolveEntries,
    render: (folder, opts) => renderSpecPage(dir, config, resolveOne(folder), opts),
    receive: (folder, blob) => receivePass(dir, config, resolveOne(folder), blob),
    // A spec this daemon cannot resolve is not a pass that was claimed — it is
    // a lookup that could not see, so it says nothing rather than reporting the
    // comfortable answer. Same rule the engine's own three states follow.
    passState: (folder, code) => {
      const one = resolveOne(folder)
      if (!one) return { state: 'unknown' }
      return readPassState(reviewOutPath(dir, one.folder, null), one.folder, code)
    },
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
