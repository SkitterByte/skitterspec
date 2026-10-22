'use strict'

/**
 * `spec-sync release <create|deployed|complete> …` — Linear Releases, driven
 * from a host project's CI (feat-tracker-releases).
 *
 * The repo decides what a release CONTAINS: the same `Refs:` scan `released`
 * runs, over the range from the previous tag in the series to this one. Linear
 * is told the answer; it is never asked to work it out (`linear-release` scans
 * by its own rules — phase 1's Notes say why it was not adopted).
 *
 * Every verb is a DRY RUN unless `--apply`, like `stage`: the resolved range,
 * the pipeline and the full plan print either way, so a wrong range is visible
 * in a CI log before anything is written.
 *
 * The range reader and the spec listing are cli-sync's, passed in as `deps`
 * rather than re-implemented: the shallow-clone guard in `readCommitRange` is
 * exactly the one a release scan needs, and a second copy would drift.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { refsInBody, onlyIgnoredPaths, ticketsInRange, partitionStageMoves } = require('./released.js')
const { releasePipelines, releaseIgnorePaths, CONFIG_FILE } = require('./config.js')
const { resolveApiKey, makeApiAdapter, releaseRefusalKind } = require('./api.js')
const { resolveTransport } = require('@skitterbyte/skitterspec-provider-kit/src/transport.js')
const {
  releaseSupport,
  pipelineForTag,
  envFor,
  unattachedRefs,
} = require('@skitterbyte/skitterspec-provider-kit/src/releases.js')

const USAGE =
  'Usage: skitterspec spec-sync release create <tag> [--from <ref>] [--env <key>] [--notes <file>]\n' +
  '                    [--link [label=]<url> …] [--apply] [--json]\n'

function gitIn(dir) {
  return (argv) => {
    try {
      return execFileSync('git', ['-C', dir, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    } catch {
      return null
    }
  }
}

// `--link https://…` or `--link "CI run=https://…"`. A value that IS a URL is
// taken whole, so a query string's own `=` never splits it into a label.
function parseLink(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return { url: value }
  const at = value.indexOf('=')
  if (at <= 0) return null
  const label = value.slice(0, at).trim()
  const url = value.slice(at + 1).trim()
  return url ? (label ? { url, label } : { url }) : null
}

/**
 * The tag in this series that precedes `tag`, or null when there is none.
 *
 * `--match '<prefix>*'` keeps it inside the series, so `skitterspec@` never
 * steps back onto a `skitterspec-linear@` tag. `<tag>^` starts from the parent,
 * so the answer is never the tag itself — and a hotfix tag forked from an older
 * release steps back to that release, because that is its ancestry.
 */
function previousTag(git, prefix, tag) {
  const out = git(['describe', '--tags', '--abbrev=0', '--match', `${prefix}*`, `${tag}^`])
  return out ? out.trim() || null : null
}

/**
 * Each ref the range carries, with the newest commit that carries it — Linear's
 * `issueReferences` wants the sha a reference was found at. Bookkeeping commits
 * are skipped exactly as `ticketsInRange` skips them, so the two cannot
 * disagree about which commits count.
 */
function refShas(commits, ignorePaths) {
  const shas = new Map()
  for (const commit of commits) {
    if (onlyIgnoredPaths(commit.paths, ignorePaths)) continue
    for (const ref of refsInBody(commit.body)) if (!shas.has(ref)) shas.set(ref, commit.sha)
  }
  return shas
}

function refusal(out, flags, lines, json = {}) {
  if (flags.json) out.write(JSON.stringify({ ok: false, error: lines[0], ...json }, null, 2) + '\n')
  else out.write(lines.join('\n') + '\n')
  return 1
}

// What a Linear refusal means, said in words a CI log reader can act on.
function describeReleaseRefusal(error) {
  const kind = releaseRefusalKind(error)
  if (kind === 'unavailable') {
    return [
      'Linear Releases is not available to this workspace (plan or feature toggle).',
      '  Turn it on in Linear, or keep using the ladder (release.stages).',
    ]
  }
  if (kind === 'scope') {
    return ['the Linear key lacks the permission this needs.', '  Re-issue the key with write access to releases.']
  }
  return [error.message]
}

async function releaseCreate(dir, config, tag, flags, out, deps) {
  const verb = 'spec-sync release create'
  const pipelines = releasePipelines(config)
  if (!pipelines.length) {
    return refusal(out, flags, [
      `${verb}: no release pipelines are declared.`,
      `  Add release.pipelines to ${CONFIG_FILE}, or run /spec-linear-setup.`,
    ])
  }
  if (!tag) return refusal(out, flags, [`${verb}: no tag given.`, USAGE.trimEnd()])

  const hit = pipelineForTag(config, tag)
  if (!hit) {
    // NOT AN ERROR. A workflow that runs on every tag reaches tags nobody
    // configured a pipeline for, and failing the job over one would be an
    // accusation against a healthy repo. Said plainly, and exit 0.
    const series = pipelines.map((p) => `${p.tagPrefix}*`).join(', ')
    if (flags.json) {
      out.write(JSON.stringify({ ok: true, tracked: false, tag, series: pipelines.map((p) => p.tagPrefix) }, null, 2) + '\n')
    } else {
      out.write(`${verb}: ${tag} is not a tracked series (${series}) — nothing to do.\n`)
    }
    return 0
  }
  const { pipeline, version } = hit

  const envKey = flags.releaseEnv || pipeline.initialEnv || null
  const env = envKey ? envFor(pipeline, envKey) : null
  if (envKey && !env) {
    const keys = pipeline.envs.map((e) => e.key).join(', ') || '(none declared)'
    return refusal(out, flags, [`${verb}: no env named ${JSON.stringify(envKey)} on ${pipeline.tagPrefix}.`, `  Declared: ${keys}`])
  }

  let notes = null
  if (flags.notesFile) {
    try {
      notes = fs.readFileSync(path.resolve(dir, flags.notesFile), 'utf-8')
    } catch (error) {
      return refusal(out, flags, [`${verb}: could not read --notes ${flags.notesFile}: ${error.message}`])
    }
  }
  const links = []
  for (const raw of flags.links || []) {
    const link = parseLink(raw)
    if (!link) return refusal(out, flags, [`${verb}: --link ${JSON.stringify(raw)} is not a URL or label=URL.`])
    links.push(link)
  }

  const git = gitIn(dir)
  const commitSha = (git(['rev-parse', '-q', '--verify', `${tag}^{commit}`]) || '').trim()
  if (!commitSha) return refusal(out, flags, [`${verb}: git cannot resolve the tag ${JSON.stringify(tag)}.`])

  // The base. `--from` wins; otherwise the previous tag in the series.
  //
  // WHAT WOULD FOOL "NO PREVIOUS TAG": a clone that never fetched its tags, or a
  // shallow one. Both answer "none" for a series that has a dozen releases, and
  // the fallback — the whole history up to this tag — would attach every
  // ticket the repo ever shipped. So "none" is believed only in a full clone,
  // and even then it is said out loud as a first release.
  const base = flags.from || previousTag(git, pipeline.tagPrefix, tag)
  if (!base && (git(['rev-parse', '--is-shallow-repository']) || '').trim() === 'true') {
    return refusal(out, flags, [
      `${verb}: refusing — no earlier ${pipeline.tagPrefix} tag is visible, and this clone is shallow.`,
      '  The range would be guessed. Fetch full history with tags (CI: fetch-depth: 0),',
      '  or pass --from <ref> to name the base.',
    ])
  }
  const read = deps.readCommitRange(dir, base ? `${base}..${tag}` : tag, 'release create')
  if (read.error) return refusal(out, flags, read.error)
  const { range, commits } = read

  const ignorePaths = releaseIgnorePaths(config)
  const report = ticketsInRange(commits, { ignorePaths })
  const teamKey = (config.linear && config.linear.teamKey) || ''
  const parts = partitionStageMoves({
    tickets: report.tickets,
    teamKey,
    specs: deps.listSpecs(dir, config),
    cededBucket: 'complete',
  })
  // Attached: finished specs AND unfinished ones. An `unfinished` ref's code
  // really is in this release (it landed via /spec-to-main), and attaching an
  // issue to a release never touches its workflow state (phase 1), so push's
  // ownership of that state is not disturbed. `foreign` and `unlinked` are
  // reported and left alone — nothing here knows what they are.
  const attach = [...parts.movable, ...parts.unfinished].map((t) => t.ref)
  const shas = refShas(commits, ignorePaths)
  const refs = attach.map((identifier) => ({ identifier, commitSha: shas.get(identifier) || commitSha }))

  const plan = {
    tag,
    pipeline: { tagPrefix: pipeline.tagPrefix, pipelineId: pipeline.pipelineId },
    version,
    range,
    firstRelease: !base,
    env: env ? { key: env.key, stage: env.stage } : null,
    attach,
    skipped: {
      foreign: parts.foreign.map((t) => t.ref),
      unlinked: parts.unlinked.map((t) => t.ref),
    },
    notes: Boolean(notes),
    links,
    unreferencedCommits: report.unreferenced,
    ignoredCommits: report.ignored,
    totalCommits: report.total,
  }

  const applying = Boolean(flags.apply)
  let release = null
  let dropped = null
  let staged = null
  if (applying) {
    const key = resolveApiKey(config, flags.env || process.env)
    const transport = resolveTransport(flags, config, key.ok)
    if (transport !== 'api' && !flags.adapter) {
      return refusal(out, flags, [
        `${verb}: refusing to apply over ${transport}.`,
        `  ${key.ok ? '--via api is required' : key.error}`,
        '  Re-run without --apply for the plan.',
      ])
    }
    const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
    const support = releaseSupport(adapter)
    if (!support.supported) {
      return refusal(out, flags, [`${verb}: this provider does not support releases (missing ${support.missing.join(', ')}).`])
    }
    try {
      release = await adapter.releaseSync({
        pipelineId: pipeline.pipelineId,
        version,
        name: tag,
        commitSha,
        refs,
        links,
        notes,
      })
      if (env) {
        staged = await adapter.releaseStage({ pipelineId: pipeline.pipelineId, version, stage: env.stage })
      }
    } catch (error) {
      return refusal(out, flags, [`${verb}: Linear refused — ${describeReleaseRefusal(error).join('\n')}`], { plan })
    }
    dropped = unattachedRefs(attach, staged || release)
  }

  if (flags.json) {
    const result = applying
      ? {
          id: release && release.id,
          url: (release && release.url) || null,
          stage: ((staged || release) && (staged || release).stage) || null,
          attached: ((staged || release) && (staged || release).issues) || null,
          unattached: dropped,
        }
      : null
    out.write(JSON.stringify({ ok: true, tracked: true, applied: applying, ...plan, release: result }, null, 2) + '\n')
    return 0
  }

  const lines = [`${verb}: ${tag} → ${pipeline.tagPrefix} (version ${version})`, `  range: ${range}`]
  if (!base) lines.push(`  first release in this series — every commit up to ${tag} counts`)
  if (env) lines.push(`  stage: ${env.key} → "${env.stage}"`)
  lines.push('')
  lines.push(`  ${applying ? 'attached' : 'would attach'} ${attach.length} ticket(s)${attach.length ? `: ${attach.join(', ')}` : ''}`)
  if (plan.skipped.foreign.length) {
    lines.push(`  skipped ${plan.skipped.foreign.length} — not team ${teamKey || '(unset)'}: ${plan.skipped.foreign.join(', ')}`)
  }
  if (plan.skipped.unlinked.length) {
    lines.push(`  skipped ${plan.skipped.unlinked.length} — no spec in this repo claims it: ${plan.skipped.unlinked.join(', ')}`)
  }
  if (dropped && dropped.length) {
    // Linear answered success and attached nothing for these — an issue it
    // could not find. Loud, because the success flag alone would hide it.
    lines.push(`  WARNING Linear did not attach ${dropped.length}: ${dropped.join(', ')} (not found in Linear?)`)
  } else if (applying && dropped === null) {
    lines.push('  (could not read back what attached)')
  }
  if (links.length) lines.push(`  links: ${links.map((l) => l.label || l.url).join(', ')}`)
  if (notes) lines.push('  notes: attached')
  lines.push('')
  lines.push(`  ${report.unreferenced} commit(s) carry no ref, of ${report.total}`)
  if (report.ignored) lines.push(`  ${report.ignored} commit(s) ignored as bookkeeping (release.ignorePaths)`)
  if (applying && release && release.url) lines.push(`  ${release.url}`)
  if (!applying) lines.push('  dry run — pass --apply to create it in Linear')
  out.write(lines.join('\n') + '\n')
  return 0
}

async function specSyncRelease(dir, config, positional, flags, out, deps) {
  const [verb, ...rest] = positional
  switch (verb) {
    case 'create':
      return releaseCreate(dir, config, rest[0], flags, out, deps)
    default:
      out.write(USAGE)
      return verb ? 1 : 0
  }
}

module.exports = { specSyncRelease, parseLink, previousTag, refShas, USAGE }
