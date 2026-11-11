'use strict'

/**
 * The epic page the review server serves at `/<token>/epic-<name>` — the same
 * answer `skitterspec epic status` prints, as a page that refreshes itself
 * (spec feat-epic-next, Decisions 5–7). PURE: it takes the answer `epicAnswer`
 * built and returns HTML.
 *
 * READ-ONLY. It carries no verdict buttons and no form; a member whose page is
 * waiting is a link to that page, where the buttons already are.
 *
 * NO PASS CODE, EVER. The server keeps every route from listing what is
 * waiting — the six digits are an address only the reader's own page shows —
 * so a waiting pass is named here by what to type, never by its code.
 *
 * LINKS ARE RELATIVE. The page is opened through whichever door the reader
 * has — loopback, LAN, tailnet — and `feat-a` resolves against that door, so
 * no cell ever has to list tiers.
 */

const { actionText } = require('./nextaction.js')

const REFRESH_SECONDS = 30

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

const href = (spec) => escapeHtml(encodeURIComponent(spec))

// The `next` cell. Each verb that names a code or a page is handled here; the
// rest are `actionText`, the same words the terminal prints.
function nextCell(row) {
  const a = row.next
  if (a.verb === 'claim') return 'verdict waiting — <code>/spec-reviewed</code> in its tab'
  if (a.verb === 'verdict') return `<a href="${href(row.spec)}">press a verdict on its page →</a>`
  if (a.command) {
    return `<code>${escapeHtml(a.command)}</code>${a.why ? ` <span class="why">${escapeHtml(a.why)}</span>` : ''}`
  }
  return escapeHtml(actionText(a))
}

function memberCell(row) {
  // An in-flight member with a tab has a page of its own on this server.
  return row.tab ? `<a href="${href(row.spec)}">${escapeHtml(row.spec)}</a>` : escapeHtml(row.spec)
}

function syncLine({ spec, phase, wait }) {
  const who = phase === null ? `${spec} starts` : `${spec} phase ${phase}`
  const mark = { met: 'met', unmet: 'not yet', 'cannot-tell': 'cannot tell' }[wait.state]
  return `${who} after ${wait.raw} (${mark})`
}

function renderEpicPage(answer, { refreshSeconds = REFRESH_SECONDS, project = null } = {}) {
  const lanes = answer.lanes === null ? 'no lane cap' : `${answer.lanes} lanes, ${answer.freeLanes} free`
  const count = `${answer.members.length} member${answer.members.length === 1 ? '' : 's'}`
  const rows = (answer.rows || [])
    .map(
      (r) =>
        `<tr class="v-${escapeHtml(r.next.verb)}"><td class="m">${memberCell(r)}</td>` +
        `<td class="s">${escapeHtml(r.next.state || r.bucket || '')}</td>` +
        `<td class="x">${nextCell(r)}</td>` +
        `<td class="t">${r.tab ? `<code>${escapeHtml(r.tab)}</code>` : '—'}</td></tr>`,
    )
    .join('\n')
  const table = answer.members.length
    ? `<table>\n<thead><tr><th>member</th><th>state</th><th>next</th><th>tab</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`
    : `<p class="empty">No member yet — no spec carries <code>&gt; **Epic:** ${escapeHtml(answer.epic)}</code>.</p>`
  const own = answer.next ? `<p class="own"><code>${escapeHtml(answer.next.command)}</code> — every member is finished</p>` : ''
  const shape = [
    ['waves', answer.waves.map((w, i) => `${i + 1}: ${w.join(', ')}`).join(' · ')],
    ['sync points', answer.syncPoints.map(syncLine).join(' · ')],
    ['never together', answer.clashes.map((c) => `${c.specs.join(' ‖ ')}`).join(' · ')],
    ['cycle', answer.cycles.map((c) => c.join(' → ')).join(' · ')],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${Number(refreshSeconds)}">
<title>${project ? `${escapeHtml(project)} · ` : ''}${escapeHtml(answer.epic)}</title>
<style>
:root { --bg:#fff; --fg:#1a1a1a; --dim:#6b6b6b; --line:#e3e3e3; --link:#0b5fbd; --hot:#a15c00 }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg:#16181c; --fg:#e6e6e6; --dim:#9a9a9a; --line:#2c2f36; --link:#7cb7ff; --hot:#f0b35a }
}
* { box-sizing:border-box }
body { margin:0; padding:2rem 1rem; background:var(--bg); color:var(--fg);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif }
main { max-width:60rem; margin:0 auto }
h1 { font-size:1.1rem; margin:0 0 .25rem; font-weight:600 }
.eyebrow { color:var(--dim); font-size:.8rem; margin:0 0 .1rem }
.sub { color:var(--dim); margin:0 0 1.25rem }
.wrap { overflow-x:auto }
table { border-collapse:collapse; width:100% }
th { text-align:left; color:var(--dim); font-weight:500; font-size:.85em }
th, td { padding:.55rem .6rem .55rem 0; border-top:1px solid var(--line); vertical-align:top }
a { color:var(--link); text-decoration:none; font-weight:600 }
a:hover { text-decoration:underline }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9em }
.why, .s, .t { color:var(--dim) }
.v-verdict .x, .v-claim .x { color:var(--hot) }
.own { margin:1rem 0 0 }
dl { margin:1.5rem 0 0; display:grid; grid-template-columns:max-content 1fr; gap:.3rem 1rem }
dt { color:var(--dim) } dd { margin:0 }
.empty, .foot { color:var(--dim) }
.foot { margin-top:1.5rem; font-size:.85em }
</style>
</head>
<body>
<main>
${project ? `<p class="eyebrow">${escapeHtml(project)}</p>\n` : ''}<h1>${escapeHtml(answer.epic)}</h1>
<p class="sub">${count} · ${escapeHtml(lanes)}</p>
<div class="wrap">${table}</div>
${own}
${shape ? `<dl>\n${shape}\n</dl>` : ''}
<p class="foot">Refreshes every ${Number(refreshSeconds)} s. Type commands in the member's own tab.</p>
</main>
</body>
</html>
`
}

module.exports = { renderEpicPage, REFRESH_SECONDS }
