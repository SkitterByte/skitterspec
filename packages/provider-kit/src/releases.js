'use strict'

/**
 * The release seam — `spec-sync release create | deployed | complete`.
 *
 * A release today is a git tag and nothing more, while `released` already
 * knows exactly which tickets a tag contains. These verbs write that down where
 * people look: a release object on the tracker holding its tickets, which the
 * host project's CI moves through its deploy stages.
 *
 * SKITTERSPEC DECIDES A RELEASE'S CONTENTS, never the tracker. The ticket set
 * is `ticketsInRange` + `partitionStageMoves` over previous-tag → this-tag:
 * the `Refs:` trailers, bookkeeping commits ignored, foreign refs excluded.
 * That is one definition of "what shipped", shared with `released`.
 *
 * EVERY VERB IS A DRY RUN UNLESS `--apply`. CI passes it; a person reading the
 * plan does not have to.
 *
 * IDEMPOTENT BY LOOKUP, not by memory. `create` finds the release for the tag
 * first and updates it; a retry on the same tag never mints a duplicate. A
 * lookup that FAILED is a cannot-tell, and refuses rather than creating
 * (`.claude/rules/negative-checks.md` rule 4) — creating on "I could not see
 * one" is exactly how duplicates are made.
 *
 * Tracker calls arrive as OPTIONAL adapter ops, feature-detected: a provider
 * without them makes every verb refuse in one line. The ops:
 *
 *   - `releaseFind(tag)`                 → release | null   (throws = cannot tell)
 *   - `releaseCreate({ tag, name, body, prerelease })` → release
 *   - `releaseUpdate(release, { name, body })`
 *   - `releaseAttach(release, tickets)`  → `{ attached, already }`
 *   - `releaseStage(release, optionName, tickets)` → `{ set }`
 *   - `releaseComplete(release)`
 *   - `releaseTagExists(tag)` OPTIONAL   → true | false     (throws = cannot tell)
 *
 * A release object carries at least `{ id, url, body }`.
 */

const { execFileSync } = require('node:child_process')

const { ticketsInRange, partitionStageMoves, stageOrderWarning } = require('./released.js')

const REQUIRED_OPS = ['releaseFind', 'releaseCreate', 'releaseUpdate', 'releaseAttach', 'releaseStage', 'releaseComplete']

// The line a release body carries so the next verb can read where the release
// is without asking anything else. An HTML comment: invisible where the body is
// rendered as markdown, and never confused with prose a person wrote.
const MARKER_RE = /<!--\s*skitterspec:release\s+v1\s+stage=([A-Za-z0-9_.-]*)\s*-->/

function stageOf(body) {
  const m = MARKER_RE.exec(String(body || ''))
  return m ? m[1] || null : null
}

function withStage(body, key) {
  const line = `<!-- skitterspec:release v1 stage=${key || ''} -->`
  const text = String(body || '')
  return MARKER_RE.test(text) ? text.replace(MARKER_RE, line) : `${text.replace(/\s+$/, '')}\n\n${line}\n`
}

function gitReader(dir) {
  return (argv) => {
    try {
      return execFileSync('git', ['-C', dir, ...argv], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' }).trim()
    } catch {
      return null
    }
  }
}

/**
 * The series a tag belongs to: the configured `tagPrefix` it starts with,
 * longest first so `skitterspec-github@` is not read as `skitterspec`.
 */
function seriesFor(series, tag) {
  return (
    [...(series || [])]
      .filter((s) => s && s.tagPrefix)
      .sort((a, b) => b.tagPrefix.length - a.tagPrefix.length)
      .find((s) => String(tag).startsWith(s.tagPrefix)) || null
  )
}

/**
 * Previous tag in the same series → this tag.
 *
 * `git describe --match '<prefix>*' <tag>^` walks back from the commit BEFORE
 * this tag, so a hotfix tag cut from a release tag ranges from that base, and
 * a tag never ranges from itself.
 *
 * WHAT WOULD FOOL THIS: a shallow clone. `describe` there finds no previous tag
 * and the range silently becomes "everything" — every ticket in history landing
 * on one release. So shallowness is asked about first, as a positive signal,
 * and refused with the fix (CI checkout `fetch-depth: 0`).
 */
function resolveRange(dir, tag, prefix, git = gitReader(dir)) {
  if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
    return {
      ok: false,
      error: 'this clone is shallow, so the previous tag cannot be found — check out with fetch-depth: 0',
    }
  }
  if (!git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])) {
    return { ok: false, error: `no tag ${tag} in this repo` }
  }
  const previous = git(['describe', '--tags', '--abbrev=0', '--match', `${prefix}*`, `${tag}^`])
  if (previous) return { ok: true, range: `${previous}..${tag}`, previous }
  return { ok: true, range: tag, previous: null, first: true }
}

/**
 * Compose the release body: the notes, then the issues, then the marker. Pure,
 * so a re-run on unchanged inputs produces the same text — which is what lets
 * `create` say "no change" rather than rewrite a release on every CI retry.
 */
function composeBody({ notes, tickets, links, stage, describe }) {
  const parts = []
  if (notes && String(notes).trim()) parts.push(String(notes).trim())
  if (tickets.length) {
    parts.push(['## Issues', '', ...tickets.map((t) => `- ${describe ? describe(t) : t.ref}`)].join('\n'))
  }
  if (links && links.length) {
    parts.push(['## Links', '', ...links.map((l) => `- [${l.label || l.url}](${l.url})`)].join('\n'))
  }
  return withStage(parts.join('\n\n'), stage)
}

// `--link <url>[=label]`, repeatable. http(s) only: this lands in a body a
// tracker renders as a link, and a `javascript:` url there is script.
function parseLinks(raw) {
  const out = []
  const bad = []
  for (const item of raw || []) {
    const s = String(item)
    const eq = s.indexOf('=', s.indexOf('://') + 3)
    const url = eq > 0 ? s.slice(0, eq) : s
    const label = eq > 0 ? s.slice(eq + 1) : null
    if (/^https?:\/\//i.test(url)) out.push({ url, label })
    else bad.push(s)
  }
  return { links: out, bad }
}

/**
 * @param {object} p
 *   - `tracker`   the tracker's name in messages
 *   - `program`   'spec-sync'
 *   - `readCommits(dir, range)` → `{ ok, commits | error }` (the provider's `released` reader)
 *   - `ticketOptions(config)` → the `ticketsInRange` options (ignorePaths, refPattern, …)
 *   - `teamKey(config)` → the foreign-ref key for `partitionStageMoves` ('' for none)
 *   - `listSpecs(dir, config)` → `[{ identifier, bucket, spec }]`
 *   - `series(config)` → `[{ tagPrefix, envs: { key: optionName } }]`
 *   - `adapterFor(config, flags)` → `{ ok, adapter | error }`
 *   - `describe(ticket)` OPTIONAL → the issue line in the body
 *   - `impossibleOverMcp` OPTIONAL — the transport answer for a provider whose
 *     MCP server cannot write releases; `(config, flags) → string | null`
 */
function makeReleaseCommands(p) {
  const prog = `${p.program || 'spec-sync'} release`

  function refuse(out, msg) {
    out.write(`${prog}: ${msg}\n`)
    return 1
  }

  // Everything a verb needs before touching the tracker, refused in one line
  // each so CI logs say exactly what was missing.
  function prepare(dir, config, tagArg, flags, out) {
    if (!tagArg) return { code: refuse(out, 'pass the tag, e.g. skitterspec@1.4.0') }
    const series = p.series(config)
    if (!series.length) return { code: refuse(out, `no releases.series configured — add one to the ${p.tracker} config`) }
    let tag = String(tagArg)
    // A bare version is accepted when exactly one series is configured — the
    // common single-package repo — and refused otherwise rather than guessed.
    if (!seriesFor(series, tag)) {
      if (series.length === 1 && /^v?\d/.test(tag)) tag = `${series[0].tagPrefix}${tag}`
      else return { code: refuse(out, `${tag} matches no releases.series tagPrefix (${series.map((s) => s.tagPrefix).join(', ')})`) }
    }
    const s = seriesFor(series, tag)
    if (p.impossibleOverMcp) {
      const why = p.impossibleOverMcp(config, flags)
      if (why) return { code: refuse(out, why) }
    }
    const got = p.adapterFor(config, flags)
    if (!got.ok) return { code: refuse(out, got.error) }
    const missing = REQUIRED_OPS.filter((op) => typeof got.adapter[op] !== 'function')
    if (missing.length) return { code: refuse(out, `the ${p.tracker} provider has no release support (${missing.join(', ')})`) }
    return { tag, series: s, adapter: got.adapter }
  }

  // The tickets a tag's range contains, split into what the release holds and
  // what it reports. Recomputed by every verb — stateless, so `deployed` and
  // `complete` act on the same set `create` attached without storing it.
  function ticketsOf(dir, config, tag, s) {
    const range = resolveRange(dir, tag, s.tagPrefix)
    if (!range.ok) return range
    const read = p.readCommits(dir, range.range)
    if (!read.ok) return { ok: false, error: read.error }
    const report = ticketsInRange(read.commits, p.ticketOptions(config))
    const parts = partitionStageMoves({ tickets: report.tickets, teamKey: p.teamKey(config), specs: p.listSpecs(dir, config) })
    // Movable AND unfinished: code that landed via /spec-to-main really is in
    // this release. Attaching never touches workflow state — push owns that.
    const attach = [...parts.movable, ...parts.unfinished]
    return { ok: true, range, report, parts, attach }
  }

  function planLines(t, tag) {
    const lines = [
      `  range:    ${t.range.range}${t.range.first ? ' (no previous release in this series — everything up to the tag)' : ''}`,
      `  attach:   ${t.attach.map((x) => x.ref).join(', ') || 'none'}`,
    ]
    if (t.parts.unfinished.length) lines.push(`  (in flight: ${t.parts.unfinished.map((x) => x.ref).join(', ')} — attached, state left to push)`)
    if (t.parts.foreign.length) lines.push(`  foreign:  ${t.parts.foreign.map((x) => x.ref).join(', ')} — not attached`)
    if (t.parts.unlinked.length) lines.push(`  unlinked: ${t.parts.unlinked.map((x) => x.ref).join(', ')} — no spec claims them, not attached`)
    lines.push(`  ${t.report.unreferenced} commit(s) carry no Refs: trailer${t.report.ignored ? `, ${t.report.ignored} bookkeeping ignored` : ''}`)
    // Without this line a range from before a tracker move reads as mostly
    // missing: those commits are neither unreferenced nor attached.
    if (t.report.historical) lines.push(`  ${t.report.historical} commit(s) reference an earlier tracker — not attached`)
    return lines
  }

  async function find(adapter, tag, out) {
    try {
      return { ok: true, release: await adapter.releaseFind(tag) }
    } catch (error) {
      refuse(out, `could not look up the release for ${tag} (${String(error.message).split('\n')[0]}) — refusing rather than risk a duplicate`)
      return { ok: false }
    }
  }

  async function create(dir, config, tagArg, flags, out) {
    const prep = prepare(dir, config, tagArg, flags, out)
    if (prep.code != null) return prep.code
    const { tag, series: s, adapter } = prep
    const t = ticketsOf(dir, config, tag, s)
    if (!t.ok) return refuse(out, t.error)
    const { links, bad } = parseLinks(flags.links)
    if (bad.length) return refuse(out, `--link must be http(s): ${bad.join(', ')}`)
    let notes = null
    if (flags.notes) {
      try {
        notes = require('node:fs').readFileSync(flags.notes, 'utf-8')
      } catch (error) {
        return refuse(out, `cannot read --notes: ${error.message}`)
      }
    }
    const envKeys = Object.keys(s.envs || {})
    const stage = flags.stage || envKeys[0] || null
    if (stage && envKeys.length && !envKeys.includes(stage)) {
      return refuse(out, `--stage ${stage} is not an env of ${s.tagPrefix} (${envKeys.join(', ')})`)
    }

    // A tracker that would CREATE a missing tag from the default branch must
    // not be handed one it has not got — the release would point at the wrong
    // commit. Positive signals only: `false` refuses, a throw is a cannot-tell
    // and the create goes ahead exactly as it would have.
    if (adapter.releaseTagExists) {
      let exists = null
      try {
        exists = await adapter.releaseTagExists(tag)
      } catch {
        exists = null
      }
      if (exists === false) return refuse(out, `${tag} is not on the ${p.tracker} remote yet — push the tag first`)
    }

    const found = await find(adapter, tag, out)
    if (!found.ok) return 1
    const existing = found.release
    // A release already past its first stage keeps the stage it is at: a CI
    // retry of `create` must not drag a deployed release back.
    const keep = existing ? stageOf(existing.body) : null
    const body = composeBody({ notes, tickets: await describeAll(adapter, t.attach), links, stage: keep || stage, describe: p.describe })

    const header = [`${prog} create: ${tag}${flags.apply ? '' : ' (dry run — pass --apply to write)'}`, ...planLines(t, tag)]
    if (!flags.apply) {
      header.push(`  would ${existing ? (existing.body === body ? 'leave the release unchanged' : 'update the release') : 'create the release'}${existing && existing.url ? ` (${existing.url})` : ''}`)
      return emit(out, flags, header, { tag, range: t.range.range, attach: t.attach.map((x) => x.ref), apply: false, existing: !!existing })
    }
    let release = existing
    if (!release) {
      release = await adapter.releaseCreate({ tag, name: tag, body, prerelease: true })
      header.push(`  created:  ${release.url || release.id}`)
    } else if (release.body !== body) {
      await adapter.releaseUpdate(release, { name: tag, body })
      header.push(`  updated:  ${release.url || release.id}`)
    } else {
      header.push(`  unchanged: ${release.url || release.id}`)
    }
    const attached = await adapter.releaseAttach(release, t.attach)
    header.push(`  issues:   ${attached.attached} noted, ${attached.already} already noted`)
    return emit(out, flags, header, { tag, range: t.range.range, attach: t.attach.map((x) => x.ref), apply: true, url: release.url || null })
  }

  async function deployed(dir, config, tagArg, envKey, flags, out) {
    const prep = prepare(dir, config, tagArg, flags, out)
    if (prep.code != null) return prep.code
    const { tag, series: s, adapter } = prep
    const envs = s.envs || {}
    if (!envKey || !(envKey in envs)) {
      return refuse(out, `pass an env of ${s.tagPrefix}: ${Object.keys(envs).join(', ') || '(none configured)'}`)
    }
    const found = await find(adapter, tag, out)
    if (!found.ok) return 1
    if (!found.release) return refuse(out, `no release for ${tag} yet — run \`release create ${tag}\` first`)
    const t = ticketsOf(dir, config, tag, s)
    if (!t.ok) return refuse(out, t.error)
    const lines = [`${prog} deployed: ${tag} → ${envKey}${flags.apply ? '' : ' (dry run — pass --apply to write)'}`]
    // WARNS, NEVER REFUSES: a rollback and a hotfix straight to prod are both
    // legitimate. The order is the series' own env order.
    const ladder = Object.keys(envs).map((key) => ({ key, state: key }))
    const from = stageOf(found.release.body)
    const warn = from ? stageOrderWarning(ladder, from, envKey) : null
    if (warn) lines.push(`  !! ${warn}`)
    lines.push(`  issues:   ${t.attach.map((x) => x.ref).join(', ') || 'none'} → "${envs[envKey]}"`)
    if (!flags.apply) return emit(out, flags, lines, { tag, env: envKey, apply: false, warn })
    const staged = await adapter.releaseStage(found.release, envs[envKey], t.attach)
    await adapter.releaseUpdate(found.release, { name: tag, body: withStage(found.release.body, envKey) })
    lines.push(`  set:      ${staged.set} issue(s)`)
    return emit(out, flags, lines, { tag, env: envKey, apply: true, warn, set: staged.set })
  }

  async function complete(dir, config, tagArg, flags, out) {
    const prep = prepare(dir, config, tagArg, flags, out)
    if (prep.code != null) return prep.code
    const { tag, adapter } = prep
    const found = await find(adapter, tag, out)
    if (!found.ok) return 1
    if (!found.release) return refuse(out, `no release for ${tag} yet — run \`release create ${tag}\` first`)
    const lines = [`${prog} complete: ${tag}${flags.apply ? '' : ' (dry run — pass --apply to write)'}`]
    if (!flags.apply) {
      lines.push(`  would mark ${found.release.url || found.release.id} complete`)
      return emit(out, flags, lines, { tag, apply: false })
    }
    await adapter.releaseComplete(found.release)
    lines.push(`  completed: ${found.release.url || found.release.id}`)
    return emit(out, flags, lines, { tag, apply: true })
  }

  // Titles for the body, best-effort: a ticket the tracker cannot read is
  // still listed, by ref. The body is information, not a gate.
  async function describeAll(adapter, tickets) {
    const out = []
    for (const t of tickets) {
      let title = null
      if (adapter.readIssue) {
        try {
          const issue = await adapter.readIssue(t.ref)
          title = issue && issue.title ? issue.title : null
        } catch {
          title = null
        }
      }
      out.push({ ...t, title })
    }
    return out
  }

  function emit(out, flags, lines, json) {
    out.write(flags.json ? JSON.stringify(json, null, 2) + '\n' : lines.join('\n') + '\n')
    return 0
  }

  async function run(dir, config, args, flags, out) {
    const [verb, tag, env] = args
    if (verb === 'create') return create(dir, config, tag, flags, out)
    if (verb === 'deployed') return deployed(dir, config, tag, env, flags, out)
    if (verb === 'complete') return complete(dir, config, tag, flags, out)
    out.write(
      `Usage: ${prog} create <tag> [--notes <f>] [--link <url>[=label]] [--stage <env>] [--apply] [--json]\n` +
        `       ${prog} deployed <tag> <env> [--apply] [--json]\n` +
        `       ${prog} complete <tag> [--apply] [--json]\n`,
    )
    return verb ? 1 : 0
  }

  return { run, create, deployed, complete }
}

module.exports = { makeReleaseCommands, resolveRange, seriesFor, composeBody, stageOf, withStage, parseLinks, REQUIRED_OPS }
