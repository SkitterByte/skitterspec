'use strict'

/**
 * Going back into a spec that is already in flight (feat-spec-resume) — the
 * engine behind `skitterspec spec-env resume <name|#N>`.
 *
 * A spec that waits on something outside the repo — a deploy, another
 * project's release, a soak period — is left and come back to. Coming back is
 * not starting: nothing here moves a bucket, assigns anyone or touches a
 * tracker. It answers three things, and the skill acts on them:
 *
 *   - which spec the argument means (a folder name, or a tracker ref read off
 *     each copy's frontmatter through `branch.identifierField`),
 *   - whether it can be resumed (only `in-progress` — read from the spec's OWN
 *     copy, since the base branch goes on reading `backlog` for the life of a
 *     spec), and how to rebuild its worktree when this machine has none,
 *   - what it is blocked on (`> **Blocked on:**`, on the overview or a phase).
 *
 * Pure: callers hand in the copies they could read and whether the worktree
 * and branches exist. `cli.js` does the reading.
 */

const { phaseProgress } = require('./phases.js')
const { shellPath } = require('./project.js')

// Same grammar as `specstate.js`'s header(): a blockquote `**Field:**` line.
function headerValue(text, field) {
  const m = new RegExp(`^>\\s*\\*\\*${field}:\\*\\*[ \\t]*(.*)$`, 'm').exec(String(text || ''))
  if (!m) return null
  const value = m[1].trim()
  return value && value !== '—' && value !== '-' ? value : null
}

// A real calendar date, or null. `2026-02-31` is not one, and a malformed
// `until` must stay text rather than become a date someone acts on.
function calendarDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null
}

/**
 * One `Blocked on:` value → `{ text, until }`. A trailing `(until YYYY-MM-DD)`
 * is the only part read as data; anything else — including an `until` that is
 * not a real date — stays in `text`, so a typo is shown rather than obeyed.
 */
function parseBlockedOn(value) {
  if (!value) return null
  const m = /^(.*?)\s*\(until\s+([^)]*)\)\s*$/.exec(value)
  const until = m ? calendarDate(m[2].trim()) : null
  return until ? { text: m[1].trim() || value, until } : { text: value, until: null }
}

/**
 * Every blocker a spec records: the overview's (`where: 'spec'`), then each
 * phase file's (`where: <phase number>`), in phase order.
 *
 * @param {{ overview: string, phases?: Array<{ n: number, text: string }> }} copy
 * @returns {Array<{ where: 'spec'|number, text: string, until: string|null }>}
 */
function blockers(copy) {
  const out = []
  const spec = parseBlockedOn(headerValue(copy && copy.overview, 'Blocked on'))
  if (spec) out.push({ where: 'spec', ...spec })
  const phases = ((copy && copy.phases) || []).filter((p) => p && typeof p.text === 'string')
  for (const p of [...phases].sort((a, b) => a.n - b.n)) {
    const b = parseBlockedOn(headerValue(p.text, 'Blocked on'))
    if (b) out.push({ where: p.n, ...b })
  }
  return out
}

/**
 * The blocker that stands in front of the NEXT build, or null.
 *
 * The next build is the first phase not `✅` — the one `/spec-next` would
 * pick. A spec-level blocker holds every phase; a phase's own holds only that
 * phase. A blocker on a LATER phase is not this build's business and says
 * nothing: a spec planned to wait at phase 4 builds phases 1–3 unhindered.
 * Nothing left to build means nothing to block.
 */
function blockingNext(copy) {
  const all = blockers(copy)
  const phases = ((copy && copy.phases) || []).filter((p) => p && typeof p.text === 'string')
  const heading = (t) => (t.split('\n').find((l) => /^#\s/.test(l)) || '').trim()
  const next = [...phases].sort((a, b) => a.n - b.n).find((p) => !heading(p.text).endsWith('✅'))
  if (!next) return null
  return all.find((b) => b.where === 'spec') || all.find((b) => b.where === next.n) || null
}

// A frontmatter field off an overview's text — the in-memory twin of
// resolve.js `readFrontmatterField`, for copies read off a branch.
function frontmatterField(text, field) {
  if (!field) return null
  const fm = /^---\n([\s\S]*?)\n---/.exec(String(text || ''))
  if (!fm) return null
  const m = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(fm[1])
  return m ? m[1].trim().replace(/^["']|["']$/g, '') || null : null
}

// `#241`, `241` and `"#241"` are one ticket, and so are `AB#241` and either of
// them: a typed ref without the tracker's prefix is matched on its number. Two
// different prefixes (`AB#241`, `XY#241`) never match, and `ABC-88` only ever
// matches itself.
function sameRef(a, b) {
  if (!a || !b) return false
  const parse = (s) => {
    const m = /^([a-z]*)#(\d+)$/.exec(String(s).trim().toLowerCase())
    return m ? { prefix: m[1], id: m[2] } : { prefix: '', id: String(s).trim().toLowerCase() }
  }
  const x = parse(a)
  const y = parse(b)
  return x.id === y.id && (!x.prefix || !y.prefix || x.prefix === y.prefix)
}

// Which copy speaks for a spec: its own worktree, then a branch (local before
// remote-tracking), then the checkout the command was run from.
const RANK = { worktree: 0, branch: 1, here: 2 }
function rank(c) {
  return RANK[c.origin] * 2 + (c.origin === 'branch' && !c.local ? 1 : 0)
}

/**
 * The copy an argument means, or a refusal.
 *
 * A FOLDER NAME WINS OVER A REF. Folder names carry a kind prefix
 * (`feat-`, `bug-`…) and tracker refs do not, so the two cannot collide in
 * practice — but if one ever did, the name someone typed for a folder is the
 * more specific claim.
 *
 * A REF THAT MATCHES NOTHING NAMES NOTHING. It never falls back to the nearest
 * spec or the only one provisioned: resuming the wrong spec writes into a
 * branch nobody asked about. Without `branch.identifierField` a ref cannot be
 * read at all, and the refusal says that rather than "not found".
 *
 * @param {string} arg
 * @param {Array<{ folder, bucket, origin: 'worktree'|'branch'|'here', local?, ref?, overview, phases }>} copies
 * @param {string} [identifierField]
 */
function findTarget(arg, copies, identifierField) {
  const wanted = String(arg || '').trim()
  if (!wanted) return { refused: 'no spec given — /spec-resume <name> or /spec-resume #<ticket>' }
  const best = (list) => [...list].sort((a, b) => rank(a) - rank(b))[0]
  const byName = copies.filter((c) => c.folder === wanted)
  if (byName.length) return { target: best(byName), by: 'name' }

  if (!identifierField) {
    return {
      refused:
        `no spec named ${wanted}` +
        (/^#?[\w-]*\d+$/.test(wanted)
          ? ', and a ticket ref cannot be looked up: branch.identifierField is not set in env.config.json'
          : ''),
    }
  }
  const byRef = copies.filter((c) => sameRef(frontmatterField(c.overview, identifierField), wanted))
  const folders = [...new Set(byRef.map((c) => c.folder))]
  if (!folders.length) return { refused: `no spec named or linked to ${wanted}` }
  if (folders.length > 1) {
    return { refused: `${wanted} is linked from more than one spec (${folders.join(', ')}) — name the one you mean` }
  }
  return { target: best(byRef), by: 'ref' }
}

/**
 * The full answer for a found copy.
 *
 * @param {object} target  the copy `findTarget` chose
 * @param {object} env     what the caller could see:
 *   `{ branch, worktreePath, worktreeExists, localBranch, remoteBranch, remote, identifierField }`
 */
function planResume(target, env) {
  const progress = phaseProgress((target.phases || []).map((p) => ({ content: p.text })))
  const base = {
    spec: target.folder,
    bucket: target.bucket,
    source: target.origin,
    branch: env.branch,
    identifier: frontmatterField(target.overview, env.identifierField),
    progress: { done: progress.done, total: progress.total, current: progress.current },
    blockers: blockers(target),
    blocking: blockingNext(target),
    worktree: { path: env.worktreePath, present: Boolean(env.worktreeExists) },
  }
  if (target.bucket !== 'in-progress') {
    const how =
      target.bucket === 'backlog'
        ? ' — it was never started; /spec-start puts it in flight'
        : reopenable(target)
          ? ' — re-opening it forks a fresh branch from the base branch as it is now'
          : ' — there is nothing left to resume'
    const r = { ok: false, ...base, refused: `${target.folder} is in ${target.bucket}${how}` }
    if (reopenable(target)) {
      r.offer = {
        kind: 'satisfy',
        label: `Re-open ${target.folder}`,
        command: `skitterspec spec-env resume ${target.folder} --reopen`,
      }
    }
    return r
  }
  if (env.worktreeExists) return { ok: true, ...base, commands: [], then: [] }

  // NEVER `-b` WITHOUT A BRANCH TO ATTACH. A fresh fork from base would hand
  // back an empty tree with the spec's work out of reach — that is a start,
  // and starting is /spec-start's. So: the local branch, else the remote's,
  // else a refusal.
  let commands
  if (env.localBranch) {
    commands = [`git worktree add ${shellPath(env.worktreePath)} ${env.branch}`]
  } else if (env.remoteBranch) {
    commands = [
      `git fetch ${env.remote} ${env.branch}`,
      `git worktree add ${shellPath(env.worktreePath)} -b ${env.branch} --track ${env.remote}/${env.branch}`,
    ]
  } else {
    return {
      ok: false,
      ...base,
      refused: `${target.folder} has no worktree and no ${env.branch} branch here or on ${env.remote} — nothing to resume from`,
    }
  }
  return { ok: true, ...base, commands, then: [`skitterspec spec-env bootstrap ${target.folder}`] }
}

/**
 * Whether a finished spec may be re-opened (feat-resume-reopen): only from
 * `complete`, and never a hotfix (it lands by tag and cherry-pick, so a
 * re-opened one has no landing path) or an epic (it holds no phases). A
 * cancelled spec's code never landed, so "from the current state" would be a
 * rebuild from the text alone — that is a new spec.
 *
 * The kind is read off the `Type:` header, falling back to the folder prefix
 * for a spec written without one.
 */
function reopenable(target) {
  if (!target || target.bucket !== 'complete') return false
  const type = (headerValue(target.overview, 'Type') || '').toLowerCase()
  if (type === 'hotfix' || type === 'epic') return false
  return !/^(hotfix|epic)-/.test(target.folder)
}

/**
 * The plan for `spec-env resume <spec> --reopen`, or a refusal with no offer.
 *
 * The spec's branch was deleted when it completed, and its work is on the base
 * branch, so re-opening is a fresh branch AT the base. The branch is created
 * here (`git branch -f`) rather than left to `up`, so `up` takes its attach
 * path: left alone, `up` would carry on from a leftover remote branch instead,
 * which is an older state than the base it landed on.
 *
 * WHAT WOULD FOOL THIS: a leftover branch with commits the base does not hold
 * — a teardown that was declined, or a squash merge, whose commits are never
 * ancestors of the base. `-f` over that branch would destroy them, so an
 * unmerged leftover, local or remote, refuses and names it. An answer the
 * caller could not get (`null`) is read the same way: a branch nobody could
 * prove safe is not reset (`.claude/rules/negative-checks.md` rule 4).
 *
 * @param {object} target  the copy `findTarget` chose
 * @param {object} env  `{ branch, base, worktreePath, worktreeExists,
 *   localBranch, localMerged, remoteBranch, remoteMerged, remote }`
 */
function planReopen(target, env) {
  const spec = target.folder
  const refuse = (refused) => ({ ok: false, spec, bucket: target.bucket, branch: env.branch, refused })
  if (!reopenable(target)) {
    if (target.bucket !== 'complete') return refuse(`${spec} is in ${target.bucket} — only a completed spec can be re-opened`)
    const epic = /^epic-/.test(spec) || (headerValue(target.overview, 'Type') || '').toLowerCase() === 'epic'
    return refuse(
      epic
        ? `${spec} is a completed epic, which holds no phases`
        : `${spec} is a completed hotfix, which lands by tag and has no branch to re-open`,
    )
  }
  if (!env.base) return refuse(`the base branch cannot be resolved, so there is nothing to fork ${spec} from`)
  if (env.worktreeExists) {
    return refuse(`a worktree for ${spec} still exists at ${env.worktreePath} — tear it down (spec-env down ${spec}) or work there`)
  }
  if (env.localBranch && env.localMerged !== true) {
    return refuse(`${env.branch} still exists with commits not on ${env.base} — land or delete it before re-opening`)
  }
  if (env.remoteBranch && env.remoteMerged !== true) {
    return refuse(
      `${env.remote}/${env.branch} still exists with commits not on ${env.base} — ` +
        `delete it (git push ${env.remote} --delete ${env.branch}) before re-opening`,
    )
  }
  return {
    ok: true,
    spec,
    bucket: target.bucket,
    branch: env.branch,
    base: env.base,
    worktree: { path: env.worktreePath, present: false },
    commands: [`git branch -f ${env.branch} ${env.base}`, `skitterspec spec-env up ${spec}`],
    move: [`git -C ${shellPath(env.worktreePath)} mv specs/complete/${spec} specs/in-progress/${spec}`],
  }
}

/** The text report for `--reopen`. */
function reopenLines(r) {
  if (!r.ok) return [`spec-env resume --reopen: refused — ${r.refused}`]
  return [
    `spec-env resume --reopen: ${r.spec} (complete → in-progress, on ${r.branch} from ${r.base})`,
    `  worktree:  ${r.worktree.path}`,
    '',
    '  to provision, run (then run what `up` prints):',
    ...r.commands.map((c) => `    ${c}`),
    '',
    '  then, move the spec:',
    ...r.move.map((c) => `    ${c}`),
  ]
}

function blockerLine(b) {
  const where = b.where === 'spec' ? 'spec' : `phase ${b.where}`
  return `${where} — ${b.text}${b.until ? ` (until ${b.until})` : ''}`
}

/** The text report — what `spec-env resume` prints without `--json`. */
function resumeLines(r) {
  if (r.refusedOnly) return [`spec-env resume: refused — ${r.refused}`]
  const lines = [`spec-env resume: ${r.spec} (${r.bucket}, on ${r.branch})`]
  if (r.identifier) lines.push(`  ticket:    ${r.identifier}`)
  const { done, total, current } = r.progress
  lines.push(
    `  phases:    ${total ? `${done} of ${total} done${current ? `, phase ${current} in progress` : ''}` : 'no phase files'}`,
  )
  for (const b of r.blockers) lines.push(`  blocked:   ${blockerLine(b)}${r.blocking && b.where === r.blocking.where ? '  ← holds the next build' : ''}`)
  if (!r.ok) {
    lines.push(`  refused:   ${r.refused}`)
    if (r.offer) lines.push(`  offer:     ${r.offer.label} — ${r.offer.command}`)
    return lines
  }
  lines.push(`  worktree:  ${r.worktree.path}${r.worktree.present ? '' : '  (missing — provision below)'}`)
  if (r.commands.length) {
    lines.push('', '  to provision, run:', ...r.commands.map((c) => `    ${c}`))
    lines.push('', '  then, run:', ...r.then.map((c) => `    ${c}`))
  }
  return lines
}

module.exports = {
  blockers,
  blockingNext,
  parseBlockedOn,
  findTarget,
  planResume,
  planReopen,
  reopenable,
  resumeLines,
  reopenLines,
  blockerLine,
  frontmatterField,
  sameRef,
}
