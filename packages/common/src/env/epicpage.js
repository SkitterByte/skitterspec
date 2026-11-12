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

const { actionText, epicRows, epicPlan } = require('./nextaction.js')

const REFRESH_SECONDS = 30

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

const href = (spec) => escapeHtml(encodeURIComponent(spec))

function memberCell(row) {
  // An in-flight member with a tab has a page of its own on this server.
  return row.tab ? `<a href="${href(row.spec)}">${escapeHtml(row.spec)}</a>` : escapeHtml(row.spec)
}

function syncLine({ spec, phase, wait }) {
  const who = phase === null ? `${spec} starts` : `${spec} phase ${phase}`
  const mark = { met: 'met', unmet: 'not yet', 'cannot-tell': 'cannot tell' }[wait.state]
  return `${who} after ${wait.raw} (${mark})`
}

// One numbered step. A pass is named by what to type and never its code, like
// the `next` cell; a verdict links to the member's page.
function stepItem(st, freeLanes) {
  const where =
    st.where === 'epic'
      ? "In the epic's tab"
      : st.where === 'new-tab'
        ? `In a new tab${freeLanes === null || freeLanes === undefined ? '' : ` (${freeLanes} lane${freeLanes === 1 ? '' : 's'} free)`}`
        : `In <code>${escapeHtml(st.tab || `${st.spec}'s tab`)}</code>`
  const what =
    st.verb === 'claim'
      ? 'verdict waiting — <code>/spec-reviewed</code>'
      : st.verb === 'verdict'
        ? `<a href="${href(st.spec)}">press a verdict on ${escapeHtml(st.spec)}'s page →</a>`
        : `<code>${escapeHtml(st.command)}</code>`
  const notes = [
    st.unblocks.length ? `<div class="un">→ unblocks ${escapeHtml(st.unblocks.join(', '))}</div>` : '',
    st.caution ? `<div class="warn">⚠ ${escapeHtml(st.caution)}</div>` : '',
  ].join('')
  return `<li><div class="where">${where}</div><div class="what">${what}</div>${notes}</li>`
}

function renderEpicPage(answer, { refreshSeconds = REFRESH_SECONDS, project = null } = {}) {
  const lanes = answer.lanes === null ? 'no lane cap' : `${answer.lanes} lanes, ${answer.freeLanes} free`
  const { rows, next } = answer.rows ? { rows: answer.rows, next: answer.next } : epicRows(answer)
  const { progress, groups, steps } = answer.steps ? answer : epicPlan(answer, { rows, next })
  const byName = new Map(rows.map((r) => [r.spec, r]))

  const section = (title, cls, names, cell) =>
    names.length
      ? `<section class="${cls}"><h2>${title} <span class="n">${names.length}</span></h2>\n<table><tbody>\n${names
          .map((n) => {
            const r = byName.get(n)
            return `<tr class="v-${escapeHtml(r.next.verb)}"><td class="m">${memberCell(r)}</td>${cell(r)}</tr>`
          })
          .join('\n')}\n</tbody></table></section>`
      : ''
  const groupsHtml = answer.members.length
    ? [
        section('In flight', 'g-flight', groups.inFlight, (r) =>
          `<td class="s">${escapeHtml(r.next.state || 'in-progress')}</td><td class="t">${r.tab ? `<code>${escapeHtml(r.tab)}</code>` : '—'}</td>`),
        section('Ready to start', 'g-ready', groups.ready, (r) =>
          `<td class="s">${r.next.why ? `<span class="warn">⚠ ${escapeHtml(r.next.why)}</span>` : 'ready'}</td>`),
        section('Waiting', 'g-wait', groups.waiting, (r) => `<td class="s">${escapeHtml(r.next.why || actionText(r.next))}</td>`),
        groups.done.length
          ? `<details class="g-done"><summary><h2>Done <span class="n">${groups.done.length}</span></h2></summary><p class="dim">${escapeHtml(groups.done.join(' · '))}</p></details>`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : `<p class="empty">No member yet — no spec carries <code>&gt; **Epic:** ${escapeHtml(answer.epic)}</code>.</p>`

  const stepsHtml = answer.members.length
    ? `<section class="steps"><h2>Next steps</h2>\n${
        steps.length
          ? `<ol>\n${steps.map((st) => stepItem(st, answer.freeLanes)).join('\n')}\n</ol>`
          : '<p class="dim">Nothing to type — every open member is building, held or waiting.</p>'
      }</section>`
    : ''
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
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
:root { --bg:#fff; --fg:#1a1a1a; --dim:#6b6b6b; --line:#e3e3e3; --link:#0b5fbd; --hot:#a15c00; --ok:#1f7a3a }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg:#16181c; --fg:#e6e6e6; --dim:#9a9a9a; --line:#2c2f36; --link:#7cb7ff; --hot:#f0b35a; --ok:#5fc27e }
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
.why, .s, .t, .dim { color:var(--dim) }
.bar { height:.5rem; background:var(--line); border-radius:.25rem; overflow:hidden; margin:0 0 1.5rem }
.bar > span { display:block; height:100%; background:var(--ok) }
h2 { font-size:.8rem; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); font-weight:600; margin:1.5rem 0 .4rem; display:inline-block }
h2 .n { font-weight:400 }
section table td.m { width:40% }
.warn { color:var(--hot) }
.v-verdict .s, .v-claim .s { color:var(--hot) }
details summary { cursor:pointer; list-style:none }
details summary::-webkit-details-marker { display:none }
details summary h2::after { content:' ▸' } details[open] summary h2::after { content:' ▾' }
.steps { border-top:2px solid var(--line); margin-top:1.75rem }
.steps ol { margin:.25rem 0 0; padding-left:1.5rem }
.steps li { margin:0 0 .9rem }
.steps .where { color:var(--dim); font-size:.9em }
.steps .what { margin:.1rem 0 }
.steps .un { color:var(--ok) }
dl { margin:.5rem 0 0; display:grid; grid-template-columns:max-content 1fr; gap:.3rem 1rem }
dt { color:var(--dim) } dd { margin:0 }
.empty, .foot { color:var(--dim) }
.foot { margin-top:1.5rem; font-size:.85em }
</style>
</head>
<body>
<main>
${project ? `<p class="eyebrow">${escapeHtml(project)}</p>\n` : ''}<h1>${escapeHtml(answer.epic)}</h1>
<p class="sub">${progress.done} of ${progress.total} done · ${progress.inFlight} in flight · ${escapeHtml(lanes)}</p>
<div class="bar" role="img" aria-label="${progress.done} of ${progress.total} done"><span style="width:${pct}%"></span></div>
<div class="wrap">${groupsHtml}</div>
${stepsHtml}
${shape ? `<details class="shape"><summary><h2>Waves · never together</h2></summary>\n<dl>\n${shape}\n</dl></details>` : ''}
<p class="foot">Refreshes every ${Number(refreshSeconds)} s. Type commands in the member's own tab.</p>
</main>
</body>
</html>
`
}

module.exports = { renderEpicPage, REFRESH_SECONDS }
