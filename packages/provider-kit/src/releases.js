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

/**
 * Parse an `x.y.z[-suffix]` version for ordering. A bare version outranks a
 * suffixed one at the same triplet (so `1.0.0` > `1.0.0-stage`), which is all
 * the precedence these tags need: the release workflow validates them to
 * `x.y.z`, and suffixes only appear on registry placeholders.
 */
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v || ''))
  return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], bare: !/[-+]/.test(v) } : null
}

/** -1 / 0 / 1 over parseVersion; an unparseable version sorts below everything. */
function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0)
  for (let i = 0; i < 3; i++) {
    if (pa.n[i] !== pb.n[i]) return pa.n[i] < pb.n[i] ? -1 : 1
  }
  if (pa.bare !== pb.bare) return pa.bare ? 1 : -1
  return 0
}

/**
 * The versions of `name` that are live on the npm registry, as a Set.
 *
 * ABSENCE IS NOT FAILURE, in either direction. A version missing from the set
 * means "not published yet" — the registry is eventually consistent, so a
 * just-approved version can be minutes away. A 404 on the whole package means
 * "unpublished, private, or too new", three states this unauthenticated read
 * cannot tell apart — so the caller treats every `ok: false` as a cannot-tell
 * and moves nothing (`.claude/rules/negative-checks.md` rule 4).
 */
async function npmLiveVersions(name, fetchImpl) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(String(name))}`
  let res
  try {
    res = await fetchImpl(url, { headers: { accept: 'application/json' } })
  } catch (error) {
    return { ok: false, reason: `registry unreachable (${String(error.message).split('\n')[0]})` }
  }
  if (res.status === 404) return { ok: false, reason: 'not on the public registry (unpublished, private, or not settled yet)' }
  if (!res.ok) return { ok: false, reason: `registry answered ${res.status}` }
  let doc
  try {
    doc = await res.json()
  } catch {
    return { ok: false, reason: 'unreadable registry answer' }
  }
  const versions = doc && doc.versions && typeof doc.versions === 'object' ? Object.keys(doc.versions) : []
  return { ok: true, versions: new Set(versions) }
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

  /**
   * `reconcile` — move every marked release whose version is live on npm (or
   * contained in a newer live version of its series) to the series' final env,
   * then complete it. The self-healing half of the mirror: approvals that
   * happen outside `release deployed` — the npm website, a missed CI run — are
   * caught here on the next run. Dry by default, like every other verb.
   *
   * Only releases carrying the skitterspec stage marker are considered, so a
   * hand-made release is never read or written. A release already at the final
   * env owes nothing and is skipped in silence.
   */
  async function reconcile(dir, config, flags, out) {
    const series = p.series(config)
    if (!series.length) return refuse(out, `no releases.series configured — add one to the ${p.tracker} config`)
    if (p.impossibleOverMcp) {
      const why = p.impossibleOverMcp(config, flags)
      if (why) return refuse(out, why)
    }
    const got = p.adapterFor(config, flags)
    if (!got.ok) return refuse(out, got.error)
    const adapter = got.adapter
    const missing = [...REQUIRED_OPS, 'releaseList'].filter((op) => typeof adapter[op] !== 'function')
    if (missing.length) return refuse(out, `the ${p.tracker} provider has no reconcile support (${missing.join(', ')})`)

    let all
    try {
      all = await adapter.releaseList()
    } catch (error) {
      // A listing that failed is a cannot-tell about every release at once:
      // refuse loudly (a scheduled run should go red) and write nothing.
      return refuse(out, `could not list releases (${String(error.message).split('\n')[0]}) — nothing reconciled`)
    }
    const marked = all.filter((r) => stageOf(r.body) != null)

    const git = gitReader(dir)
    // Same refusal as `create`: `describe` in a shallow clone finds no previous
    // tag and a range silently becomes "everything".
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
      return refuse(out, 'this clone is shallow, so tag ranges cannot be resolved — check out with fetch-depth: 0')
    }
    const existingTags = new Set(all.map((r) => r.tag))

    const fetchImpl = flags.fetch || p.fetch || globalThis.fetch
    const lines = [`${prog} reconcile:${flags.apply ? '' : ' (dry run — pass --apply to write)'}`]
    const result = { apply: !!flags.apply, releases: [] }
    const note = (tag, action, reason) => {
      lines.push(`  ${tag}: ${action}${reason ? ` — ${reason}` : ''}`)
      result.releases.push({ tag, action, ...(reason ? { reason } : {}) })
    }

    for (const s of series) {
      const envKeys = Object.keys(s.envs || {})
      const firstEnv = envKeys[0]
      const finalEnv = envKeys[envKeys.length - 1]
      const mine = marked.filter((r) => seriesFor(series, r.tag) === s)
      const tailOf = (tag) => tag.slice(s.tagPrefix.length)

      // Backfill: pushed tags with NO release at all — the batched-push case,
      // where no workflow ran. Bounded so history never floods the releases
      // page: only tags newer than the series' newest marked release, and the
      // newest tag alone where the series has none — OLDER UNMIRRORED TAGS ARE
      // DELIBERATELY LEFT AS HISTORY. A tag whose release exists but carries
      // no marker is hand-made, so `existingTags` (not `mine`) excludes it.
      const newestKnown = mine.map((r) => tailOf(r.tag)).sort(compareVersions).pop() || null
      let missing = (git(['tag', '--list', `${s.tagPrefix}*`]) || '')
        .split('\n')
        .filter((t) => t && !existingTags.has(t))
        .sort((a, b) => compareVersions(tailOf(a), tailOf(b)))
      missing = newestKnown ? missing.filter((t) => compareVersions(tailOf(t), newestKnown) > 0) : missing.slice(-1)

      const open = [
        ...mine.filter((r) => stageOf(r.body) !== finalEnv).map((r) => ({ tag: r.tag, release: r })),
        ...missing.map((tag) => ({ tag, release: null })),
      ].sort((a, b) => compareVersions(tailOf(a.tag), tailOf(b.tag)))
      if (!finalEnv || !open.length) continue
      if (!s.npm) {
        note(`${s.tagPrefix}*`, 'skipped', `${open.length} release(s) owe a move or a backfill, but the series has no "npm" name to probe`)
        continue
      }
      const live = await npmLiveVersions(s.npm, fetchImpl)
      if (!live.ok) {
        // Cannot tell is not "not published": keep every release where it is.
        note(`${s.tagPrefix}*`, 'skipped', `npm ${s.npm}: ${live.reason}`)
        continue
      }
      const newestLive = [...live.versions].sort(compareVersions).pop() || null
      // A release already at the final env bounds `make_latest`: a reconciled
      // older version must never steal Latest from it.
      const newestFinal = mine
        .filter((r) => stageOf(r.body) === finalEnv)
        .map((r) => tailOf(r.tag))
        .sort(compareVersions)
        .pop()
      const movable = open.filter((entry) => {
        const v = tailOf(entry.tag)
        // Live itself, or contained: a NEWER live version in the same series
        // carries this tag's commits, so its issues shipped.
        return live.versions.has(v) || (newestLive && compareVersions(newestLive, v) > 0)
      })
      const latestTag = movable.length ? movable[movable.length - 1].tag : null
      for (const entry of open) {
        const v = tailOf(entry.tag)
        const mov = movable.includes(entry)
        const latest = mov && entry.tag === latestTag && (!newestFinal || compareVersions(v, newestFinal) > 0)
        if (!flags.apply) {
          if (!entry.release) note(entry.tag, mov ? `would create, move to ${finalEnv} and complete${latest ? ' (latest)' : ''}` : `would create at ${firstEnv}`, 'no release yet')
          else if (!mov) note(entry.tag, 'kept', `not on npm yet (${s.npm})`)
          else note(entry.tag, `would move to ${finalEnv} and complete${latest ? ' (latest)' : ''}`)
          continue
        }
        if (entry.release && !mov) {
          note(entry.tag, 'kept', `not on npm yet (${s.npm})`)
          continue
        }
        const t = ticketsOf(dir, config, entry.tag, s)
        if (!t.ok) {
          note(entry.tag, 'skipped', t.error)
          continue
        }
        let r = entry.release
        let created = false
        if (!r) {
          // The same guard `create` carries: a tracker handed a tag it lacks
          // CREATES it at the default branch's head. `false` refuses this tag;
          // a throw is a cannot-tell and the create goes ahead.
          if (adapter.releaseTagExists) {
            let exists = null
            try {
              exists = await adapter.releaseTagExists(entry.tag)
            } catch {
              exists = null
            }
            if (exists === false) {
              note(entry.tag, 'skipped', `not on the ${p.tracker} remote yet — push the tag first`)
              continue
            }
          }
          const body = composeBody({ notes: null, tickets: await describeAll(adapter, t.attach), links: [], stage: firstEnv, describe: p.describe })
          r = await adapter.releaseCreate({ tag: entry.tag, name: entry.tag, body, prerelease: true })
          await adapter.releaseAttach(r, t.attach)
          await adapter.releaseStage(r, s.envs[firstEnv], t.attach)
          created = true
          if (!mov) {
            note(entry.tag, `created at ${firstEnv}`, `${t.attach.length} issue(s)`)
            continue
          }
        }
        await adapter.releaseStage(r, s.envs[finalEnv], t.attach)
        await adapter.releaseUpdate(r, { name: entry.tag, body: withStage(r.body, finalEnv) })
        await adapter.releaseComplete(r, { latest })
        note(entry.tag, `${created ? 'created, ' : ''}moved to ${finalEnv} and completed${latest ? ' (latest)' : ''}`, `${t.attach.length} issue(s)`)
      }
    }
    if (lines.length === 1) lines.push('  nothing to reconcile')
    return emit(out, flags, lines, result)
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
    if (verb === 'reconcile') return reconcile(dir, config, flags, out)
    out.write(
      `Usage: ${prog} create <tag> [--notes <f>] [--link <url>[=label]] [--stage <env>] [--apply] [--json]\n` +
        `       ${prog} deployed <tag> <env> [--apply] [--json]\n` +
        `       ${prog} complete <tag> [--apply] [--json]\n` +
        `       ${prog} reconcile [--apply] [--json]\n`,
    )
    return verb ? 1 : 0
  }

  return { run, create, deployed, complete, reconcile }
}

module.exports = { makeReleaseCommands, resolveRange, seriesFor, composeBody, stageOf, withStage, parseLinks, parseVersion, compareVersions, npmLiveVersions, REQUIRED_OPS }
