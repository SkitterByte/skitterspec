'use strict'

/**
 * Collect a spec's diff and emit a self-contained review page.
 *
 * Everything here reads the spec's worktree with `git -C <worktreePath>` and
 * never changes directory or spawns anything inside it — the whole point of the
 * feature is that you review a worktree's work from wherever your shell already
 * is (usually the primary checkout, often a phone). The collector is pure apart
 * from the injected `git` runner; the output path and the clock come from the
 * caller so the page is deterministic under test.
 *
 * The diff data NEVER passes through a model: git writes the patches, this
 * module splices them into the page's JSON island as text. That is what makes a
 * 266KB patch cost nothing to produce.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// `-U` large enough that a file's patch IS the file. Reviewing a changed line
// needs the code around it, and this costs a git flag rather than a second read;
// the viewer collapses the unchanged runs back down.
const WHOLE_FILE_CONTEXT = 100000

// Past this, whole-file context is bloating the page rather than informing it —
// regenerate that one file at -U3 and say so. Deliberately a constant and NOT a
// config key: nobody is going to tune this, and an untuned key is a surface to
// document, validate and test for no gain.
const PATCH_LIMIT_BYTES = 400 * 1024

// Where the page lands by default. `.spec-env/` is gitignored by the installer,
// so a review is local, free and leaves no trace in the branch under review.
const REVIEW_DIR = path.join('.spec-env', 'reviews')

// Bookkeeping the viewer should collapse: the spec folders themselves and the
// push snapshot that lives among them. The ENGINE decides this, because it knows
// the spec's own paths — a viewer guessing from regexes would get it wrong the
// first time someone's product code lived under a folder called `specs`.
function isNoise(relPath) {
  return relPath.startsWith('specs/') || relPath.startsWith('.spec-env/')
}

/**
 * A git runner bound to one checkout, returning stdout **untrimmed**.
 *
 * The untrimmed part is load-bearing and is why this does not reuse the CLI's
 * `gitReader`: `git status --porcelain` puts a SPACE in the first column for an
 * unstaged change, so trimming the whole output shifts every path by one
 * character. (Found the hard way in the prototype.)
 *
 * A non-zero exit whose stdout is still useful is returned rather than thrown —
 * `git diff --no-index` exits 1 precisely when the files differ, which is the
 * case we call it for.
 */
function rawGitReader(worktreePath) {
  return (argv) => {
    try {
      return execFileSync('git', ['-C', worktreePath, ...argv], {
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      })
    } catch (err) {
      if (err && typeof err.stdout === 'string') return err.stdout
      if (err && err.stdout) return err.stdout.toString()
      return null
    }
  }
}

// Split output into lines WITHOUT trimming the lines themselves (see above).
// Only the trailing newline git always emits is dropped.
function lines(out) {
  if (!out) return []
  return out.replace(/\n$/, '').split('\n').filter((l) => l !== '')
}

// `--numstat` emits one row per file; we ask per-file, so take the FIRST line
// and split that — splitting the whole output merges a second file's counts into
// the first (the prototype's other bug). A binary file reports `-` for both.
function parseNumstat(out) {
  const first = lines(out)[0]
  if (!first) return { additions: 0, deletions: 0, binary: false }
  const [a, d] = first.split('\t')
  if (a === '-' || d === '-') return { additions: 0, deletions: 0, binary: true }
  return { additions: Number(a) || 0, deletions: Number(d) || 0, binary: false }
}

// Map a `--name-status` code to the status the viewer shows.
function statusFromCode(code) {
  const c = code[0]
  if (c === 'A') return 'new'
  if (c === 'D') return 'deleted'
  if (c === 'R') return 'renamed'
  if (c === 'C') return 'copied'
  return 'modified'
}

/**
 * The tracked files that changed between `ref` and the working tree, in git's
 * own order. `R`/`C` rows carry two paths (old, new) — the NEW path is the one
 * to diff and display, and the old one is kept so the viewer can say where it
 * came from.
 */
function trackedFiles(git, ref) {
  // Rename detection is git's default (diff.renames since 2.9) — left implicit
  // rather than forced, so a project that turns it off gets what it configured.
  const out = git(['diff', ref, '--name-status'])
  const rows = []
  for (const line of lines(out)) {
    const parts = line.split('\t')
    const code = parts[0]
    if (!code) continue
    if ((code[0] === 'R' || code[0] === 'C') && parts.length >= 3) {
      rows.push({ path: parts[2], from: parts[1], status: statusFromCode(code) })
    } else if (parts.length >= 2) {
      rows.push({ path: parts[1], from: null, status: statusFromCode(code) })
    }
  }
  return rows
}

/**
 * Untracked files, which `git diff` cannot see at all — a new test file would
 * otherwise be invisible, and that is the single most review-worthy thing a
 * phase produces. `-uall` lists them individually rather than collapsing a new
 * directory to one `dir/` row we would then have to walk ourselves.
 */
function untrackedFiles(git) {
  const out = git(['status', '--porcelain', '-uall'])
  const rows = []
  for (const line of lines(out)) {
    // Columns are fixed: XY then a space then the path. NEVER trim the line.
    if (line.slice(0, 2) !== '??') continue
    const p = line.slice(3)
    if (p) rows.push({ path: p, from: null, status: 'new' })
  }
  return rows
}

// The patch for one file, whole-file by default and falling back to -U3 when
// that is absurdly large. `untracked` files come in via --no-index against
// /dev/null, which is the only way git will diff a file it does not track.
function patchFor(git, ref, file, untracked) {
  const gen = (u) =>
    untracked
      ? git(['diff', '--no-index', `--unified=${u}`, '--', '/dev/null', file.path])
      : git(['diff', ref, `--unified=${u}`, '--', file.path])

  let patch = gen(WHOLE_FILE_CONTEXT) || ''
  let whole = true
  if (Buffer.byteLength(patch, 'utf8') > PATCH_LIMIT_BYTES) {
    patch = gen(3) || ''
    whole = false
  }
  return { patch, whole }
}

function numstatFor(git, ref, file, untracked) {
  const out = untracked
    ? git(['diff', '--no-index', '--numstat', '--', '/dev/null', file.path])
    : git(['diff', ref, '--numstat', '--', file.path])
  return parseNumstat(out)
}

/**
 * Collect everything the page needs.
 *
 * `mode` is `'working'` (uncommitted work vs HEAD — the default, "what did this
 * phase just do") or `'branch'` (everything since the base branch — "what does
 * this whole spec do"). Both resolve to a single ref diffed against the working
 * tree, so committed and uncommitted work are collected by one code path.
 */
function collectReview({ spec, git, mode = 'working', ref, base = null, now }) {
  const files = []
  for (const f of trackedFiles(git, ref)) {
    const { patch, whole } = patchFor(git, ref, f, false)
    const { additions, deletions, binary } = numstatFor(git, ref, f, false)
    files.push({ ...f, additions, deletions, binary, whole, noise: isNoise(f.path), patch })
  }
  for (const f of untrackedFiles(git)) {
    const { patch, whole } = patchFor(git, ref, f, true)
    const { additions, deletions, binary } = numstatFor(git, ref, f, true)
    files.push({ ...f, additions, deletions, binary, whole, noise: isNoise(f.path), patch })
  }

  const totals = files.reduce(
    (acc, f) => ({
      files: acc.files + 1,
      additions: acc.additions + f.additions,
      deletions: acc.deletions + f.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  )

  return {
    spec: spec.folder,
    title: spec.folder,
    branch: spec.branch,
    worktree: spec.worktreePath,
    mode,
    base,
    ref,
    generatedAt: now,
    totals,
    files,
    review: null,
  }
}


/**
 * The page template.
 *
 * It lives here as a constant for now; phase 2 moves it into
 * `packages/common/assets/review/` as a shipped asset and replaces the viewer
 * wholesale. The two placeholders are the seam that move depends on, so they are
 * already the real ones: the engine SPLICES data and prose into a template, it
 * never generates markup from the data.
 */
const DATA_PLACEHOLDER = '__REVIEW_DATA__'
const REVIEW_PLACEHOLDER = '__REVIEW_BLOCK__'

const TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__REVIEW_TITLE__</title>
<style>
:root {
  --bg: #ffffff; --fg: #1b1b1f; --muted: #5c5f6b; --line: #e3e4e8;
  --panel: #f7f7f9; --add-bg: #e6ffec; --add-fg: #0a5722;
  --del-bg: #ffebe9; --del-fg: #82071e; --meta: #6b6f7b;
}
:root:not([data-theme="light"]) {
  @media (prefers-color-scheme: dark) {
    --bg: #16171a; --fg: #e6e7ea; --muted: #9a9eab; --line: #2c2e35;
    --panel: #1d1f24; --add-bg: #12261a; --add-fg: #7ee08a;
    --del-bg: #2b1416; --del-fg: #ff9a92; --meta: #9a9eab;
  }
}
:root[data-theme="dark"] {
  --bg: #16171a; --fg: #e6e7ea; --muted: #9a9eab; --line: #2c2e35;
  --panel: #1d1f24; --add-bg: #12261a; --add-fg: #7ee08a;
  --del-bg: #2b1416; --del-fg: #ff9a92; --meta: #9a9eab;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
.meta { color: var(--meta); font-size: .85rem; margin: 0 0 1.25rem; }
.file { border: 1px solid var(--line); border-radius: 8px; margin: 0 0 1rem; overflow: hidden; }
.file > summary {
  cursor: pointer; padding: .6rem .75rem; background: var(--panel);
  display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap;
}
.file > summary:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
.path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85rem; word-break: break-all; }
.tag { font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.counts { margin-left: auto; font-size: .8rem; font-family: ui-monospace, monospace; }
.counts .a { color: var(--add-fg); }
.counts .d { color: var(--del-fg); }
.patch { overflow-x: auto; }
.patch pre { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
.patch .l { display: block; padding: 0 .75rem; white-space: pre; }
.patch .add { background: var(--add-bg); color: var(--add-fg); }
.patch .del { background: var(--del-bg); color: var(--del-fg); }
.patch .hunk { color: var(--muted); }
.empty { color: var(--muted); }
</style>
</head>
<body>
<main>
<h1 id="title"></h1>
<p class="meta" id="meta"></p>
__REVIEW_BLOCK__
<div id="files"></div>
</main>
<script type="application/json" id="review-data">__REVIEW_DATA__</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById('review-data').textContent)
  document.getElementById('title').textContent = data.title
  var t = data.totals
  document.getElementById('meta').textContent =
    data.branch + ' · ' + (data.mode === 'branch' ? 'since ' + data.base : 'uncommitted') +
    ' · ' + t.files + ' file' + (t.files === 1 ? '' : 's') +
    ' +' + t.additions + ' -' + t.deletions + ' · ' + data.generatedAt
  var host = document.getElementById('files')
  if (!data.files.length) {
    host.innerHTML = '<p class="empty">Nothing to review — no changes found.</p>'
    return
  }
  data.files.forEach(function (f) {
    var d = document.createElement('details')
    d.className = 'file'
    if (!f.noise) d.open = true
    var s = document.createElement('summary')
    var p = document.createElement('span')
    p.className = 'path'
    p.textContent = f.path
    var tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = f.status + (f.whole ? '' : ' · truncated context') + (f.noise ? ' · noise' : '')
    var c = document.createElement('span')
    c.className = 'counts'
    c.innerHTML = '<span class="a">+' + f.additions + '</span> <span class="d">-' + f.deletions + '</span>'
    s.appendChild(p); s.appendChild(tag); s.appendChild(c)
    d.appendChild(s)
    var wrap = document.createElement('div')
    wrap.className = 'patch'
    var pre = document.createElement('pre')
    f.patch.split('\\n').forEach(function (line) {
      var span = document.createElement('span')
      span.className = 'l' + (line[0] === '+' && line.slice(0, 3) !== '+++' ? ' add'
        : line[0] === '-' && line.slice(0, 3) !== '---' ? ' del'
        : line.slice(0, 2) === '@@' ? ' hunk' : '')
      span.textContent = line
      pre.appendChild(span)
    })
    wrap.appendChild(pre)
    d.appendChild(wrap)
    host.appendChild(d)
  })
})()
</script>
</body>
</html>
`

// Escape the one sequence that could end the data island early. A patch
// containing `</script>` is not hypothetical — this feature reviews its own
// source, and the template above contains one.
function escapeIsland(json) {
  return json.replace(/<\//g, '<\\/')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

/**
 * Splice the collected data (and, later, the written review) into the template.
 * The data goes in as JSON, never as generated markup — that is the property the
 * whole design rests on.
 */
function renderReviewPage(data, { template = TEMPLATE, reviewHtml = '' } = {}) {
  return template
    .split('__REVIEW_TITLE__')
    .join(escapeHtml(data.title))
    .split(REVIEW_PLACEHOLDER)
    .join(reviewHtml)
    .split(DATA_PLACEHOLDER)
    .join(escapeIsland(JSON.stringify(data)))
}

// Default output path for a spec's page, under the gitignored `.spec-env/`.
function reviewOutPath(dir, specFolder, out) {
  if (out) return path.resolve(dir, out)
  return path.join(dir, REVIEW_DIR, `${specFolder}.html`)
}

// Write the page, creating its directory. Returns the absolute path written.
function writeReviewPage(outPath, html) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, html)
  return outPath
}

module.exports = {
  WHOLE_FILE_CONTEXT,
  PATCH_LIMIT_BYTES,
  REVIEW_DIR,
  rawGitReader,
  isNoise,
  lines,
  parseNumstat,
  trackedFiles,
  untrackedFiles,
  collectReview,
  renderReviewPage,
  reviewOutPath,
  writeReviewPage,
  escapeIsland,
  DATA_PLACEHOLDER,
  REVIEW_PLACEHOLDER,
  TEMPLATE,
}
