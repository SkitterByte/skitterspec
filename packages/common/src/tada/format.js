'use strict'

/**
 * The digest as text — what `skitterspec tada` prints and what the skill
 * reads. A fifth of the JSON's size, because every byte here is a token the
 * recap costs. Pure.
 *
 * Line markers carry the kind, so the skill can tell them apart without
 * labels: `*` a lifecycle move, `+` a commit, `-` a prompt.
 */

function formatTada(digest) {
  const w = digest.window
  const out = [`ta-da: ${w.label || `${w.since} → ${w.until}`}`]
  if (digest.projects.length === 0) out.push('  nothing in this window.')
  for (const p of digest.projects) {
    out.push('', `${p.name}${p.repo ? `  (${p.repo})` : '  (not a git repo)'}`)
    for (const g of p.groups) {
      const head = g.spec ? `${g.spec}${g.ticket ? ` [${g.ticket.id}]` : ''}` : `${g.branch || '(no branch)'} — no spec`
      out.push(`  ${head}`)
      for (const e of g.events) out.push(`    * ${e.kind === 'phase-done' ? `phase ${e.phase} done` : e.kind}`)
      for (const c of g.commits) out.push(`    + ${c.sha} ${c.subject}`)
      const sessions = g.sessions.length
      if (sessions) out.push(`    ${sessions} session${sessions === 1 ? '' : 's'}:`)
      for (const s of g.sessions) {
        for (const pr of s.prompts) out.push(`    - ${pr.command ? `${pr.command} ` : ''}${pr.text}`.trimEnd())
        if (s.omitted) out.push(`    … ${s.omitted} more`)
      }
      if (g.inFlight) out.push(`    in flight: ${g.inFlight.detail}${g.inFlight.next ? ` · next: ${g.inFlight.next}` : ''}`)
    }
  }
  for (const n of digest.notes) out.push('', n)
  return out.join('\n') + '\n'
}

module.exports = { formatTada }
