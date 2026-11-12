'use strict'

/**
 * The ta-da list as a page: the model's recap on top, the digest it was
 * written from underneath. PURE — digest and recap in, HTML out.
 *
 * READ-ONLY AND UNSERVED. No form, no buttons, no script beyond nothing: a
 * recap asks no verdict, so it has nothing to send back and no server to send
 * it to. It is a file on this machine; publishing it is a separate act.
 *
 * EVERYTHING IS ESCAPED BEFORE IT IS FORMATTED. The digest quotes the reader's
 * own prompts and commit subjects, and the recap is model-written markdown —
 * neither is trusted to be HTML. The markdown subset below works on escaped
 * text, so a `<script>` in a prompt arrives as text, never as a tag.
 */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Inline markdown on ALREADY-ESCAPED text: code first, so `**` inside a code
// span stays literal; then bold, then italic.
function inline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
}

/**
 * The markdown a recap uses and nothing more: `#`–`###` headings, `-`/`*`
 * bullets (one level), paragraphs, and inline code, bold and italic. Anything
 * else reads as a paragraph of text — the safe failure for a recap.
 */
function renderMarkdown(md) {
  const out = []
  let list = false
  let para = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(escapeHtml(para.join(' ')))}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push('</ul>')
    list = false
  }
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trimEnd()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flushPara()
      closeList()
    } else if (heading) {
      flushPara()
      closeList()
      const level = heading[1].length + 1 // the page's own title is the h1
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`)
    } else if (bullet) {
      flushPara()
      if (!list) out.push('<ul>')
      list = true
      out.push(`<li>${inline(escapeHtml(bullet[1]))}</li>`)
    } else {
      closeList()
      para.push(line.trim())
    }
  }
  flushPara()
  closeList()
  return out.join('\n')
}

const EVENT = { written: 'spec written', started: 'started', completed: 'completed', cancelled: 'cancelled' }
const eventText = (e) => (e.kind === 'phase-done' ? `phase ${e.phase} done` : EVENT[e.kind] || e.kind)

function ticketHtml(t) {
  if (!t) return ''
  const id = escapeHtml(t.id)
  return t.url ? ` <a class="ticket" href="${escapeHtml(t.url)}">${id}</a>` : ` <span class="ticket">${id}</span>`
}

function groupHtml(g) {
  const head = g.spec
    ? `<span class="spec">${escapeHtml(g.spec)}</span>${ticketHtml(g.ticket)}`
    : `<span class="branch">${escapeHtml(g.branch || '(no branch)')}</span> <span class="muted">no spec</span>`
  const parts = [`<h4>${head}</h4>`]
  if (g.events.length) {
    parts.push(`<div class="chips">${g.events.map((e) => `<span class="chip">${escapeHtml(eventText(e))}</span>`).join('')}</div>`)
  }
  if (g.commits.length) {
    parts.push(
      `<ul class="commits">${g.commits
        .map((c) => `<li><code>${escapeHtml(c.sha)}</code> ${escapeHtml(c.subject)}</li>`)
        .join('')}</ul>`,
    )
  }
  if (g.sessions.length) {
    const prompts = g.sessions
      .map(
        (s) =>
          s.prompts.map((p) => `<li>${p.command ? `<code>${escapeHtml(p.command)}</code> ` : ''}${escapeHtml(p.text)}</li>`).join('') +
          (s.omitted ? `<li class="muted">… ${s.omitted} more</li>` : ''),
      )
      .join('')
    const n = g.sessions.length
    parts.push(`<details><summary>${n} session${n === 1 ? '' : 's'}</summary><ul class="prompts">${prompts}</ul></details>`)
  }
  if (g.inFlight) {
    const next = g.inFlight.next ? ` · next: <code>${escapeHtml(g.inFlight.next)}</code>` : ''
    parts.push(`<p class="inflight">in flight: ${escapeHtml(g.inFlight.detail)}${next}</p>`)
  }
  return `<section class="group">${parts.join('\n')}</section>`
}

/**
 * @param {object} digest  `buildDigest`'s answer
 * @param {object} opts
 *   - `recap`  the model's markdown recap, or null for the digest alone
 *   - `title`  the page title — the caller's, in the reader's own dates
 *              (`windowLabel`); the digest only knows UTC instants
 */
function renderTadaPage(digest, { recap = null, title = 'Ta-da' } = {}) {
  const name = title
  const projects = digest.projects
    .map(
      (p) =>
        `<article class="project"><h3>${escapeHtml(p.name)} <span class="muted">${escapeHtml(p.repo || 'not a git repo')}</span></h3>\n` +
        `${p.groups.map(groupHtml).join('\n') || '<p class="muted">nothing here</p>'}</article>`,
    )
    .join('\n')
  const notes = digest.notes.length ? `<ul class="notes">${digest.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title>
<style>
/* The light palette is complete on bare :root; the dark blocks only redefine. */
:root {
  --bg: #ffffff; --fg: #1b1b1f; --muted: #5c6070; --line: #e1e3e8;
  --panel: #f6f7f9; --accent: #0b5fd0; --chip-bg: #eceef2; --chip-fg: #46506a;
  --good-fg: #1a7f37; --good-bg: #eaf8ee;
}
:root:not([data-theme="light"]) {
  @media (prefers-color-scheme: dark) {
    --bg: #121316; --fg: #e4e6ea; --muted: #969bab; --line: #2a2c34;
    --panel: #1a1c21; --accent: #7fb0ff; --chip-bg: #23262d; --chip-fg: #a3aabd;
    --good-fg: #7ee08a; --good-bg: #12261a;
  }
}
:root[data-theme="dark"] {
  --bg: #121316; --fg: #e4e6ea; --muted: #969bab; --line: #2a2c34;
  --panel: #1a1c21; --accent: #7fb0ff; --chip-bg: #23262d; --chip-fg: #a3aabd;
  --good-fg: #7ee08a; --good-bg: #12261a;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 820px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.6rem; margin: 0 0 4px; }
h2 { font-size: 1.25rem; margin: 28px 0 8px; }
h3 { font-size: 1.1rem; margin: 0 0 12px; overflow-wrap: anywhere; }
h4 { font-size: 1rem; margin: 0 0 6px; overflow-wrap: anywhere; }
a { color: var(--accent); }
code { font: 0.88em ui-monospace, "SF Mono", Menlo, monospace; overflow-wrap: anywhere; }
.muted { color: var(--muted); font-weight: normal; font-size: 0.9em; }
.window { color: var(--muted); margin: 0 0 20px; }
.recap { border: 1px solid var(--line); border-radius: 10px; padding: 4px 18px 12px; background: var(--good-bg); }
.project { border-top: 1px solid var(--line); padding-top: 18px; margin-top: 24px; }
.group { background: var(--panel); border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.chip { background: var(--chip-bg); color: var(--chip-fg); border-radius: 999px; padding: 1px 10px; font-size: 0.85em; }
.ticket { font-weight: normal; font-size: 0.9em; }
ul { padding-left: 1.2em; margin: 6px 0; }
.commits, .prompts { list-style: none; padding-left: 0; }
.commits li, .prompts li { overflow-wrap: anywhere; }
.inflight { margin: 8px 0 0; color: var(--good-fg); }
.notes { color: var(--muted); font-size: 0.9em; }
details summary { cursor: pointer; color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(name)}</h1>
<p class="window">${escapeHtml(digest.window.since)} → ${escapeHtml(digest.window.until)}</p>
${recap ? `<section class="recap">${renderMarkdown(recap)}</section>` : ''}
<h2>What it was written from</h2>
${projects || '<p class="muted">Nothing in this window.</p>'}
${notes}
</main>
</body>
</html>
`
}

module.exports = { renderTadaPage, renderMarkdown, escapeHtml }
