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

const { refsInBody, onlyIgnoredPaths, ticketsInRange, partitionStageMoves, stageOrderWarning } = require('./released.js')
const { releasePipelines, releaseIgnorePaths, releaseStages, mergeConfig, defaults: configDefaults, CONFIG_FILE } = require('./config.js')
const { resolveApiKey, makeApiAdapter, releaseRefusalKind } = require('./api.js')
const { resolveTransport } = require('@skitterbyte/skitterspec-provider-kit/src/transport.js')
const {
  releaseSupport,
  pipelineForTag,
  pipelineForPrefix,
  envFor,
  unattachedRefs,
} = require('@skitterbyte/skitterspec-provider-kit/src/releases.js')

const USAGE =
  'Usage: skitterspec spec-sync release create <tag> [--from <ref>] [--env <key>] [--notes <file>]\n' +
  '                    [--link [label=]<url> …] [--apply] [--json]\n' +
  '       skitterspec spec-sync release deployed <version> <env> [--series <prefix>] [--apply] [--json]\n' +
  '       skitterspec spec-sync release complete <version> [--series <prefix>] [--notes <file>]\n' +
  '                    [--link [label=]<url> …] [--apply] [--json]\n' +
  '       skitterspec spec-sync release pipelines [--json]\n' +
  '       skitterspec spec-sync release link --release-pipeline <prefix>=<id> …\n' +
  '                    [--release-env <prefix>:<env>=<stage> …] [--release-initial <prefix>=<env> …] [--json]\n'

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

// `--notes <file>` and `--link …`, shared by `create` and `complete`.
function readExtras(dir, flags, verb) {
  let notes = null
  if (flags.notesFile) {
    try {
      notes = fs.readFileSync(path.resolve(dir, flags.notesFile), 'utf-8')
    } catch (error) {
      return { error: [`${verb}: could not read --notes ${flags.notesFile}: ${error.message}`] }
    }
  }
  const links = []
  for (const raw of flags.links || []) {
    const link = parseLink(raw)
    if (!link) return { error: [`${verb}: --link ${JSON.stringify(raw)} is not a URL or label=URL.`] }
    links.push(link)
  }
  return { notes, links }
}

function refusal(out, flags, lines, json = {}) {
  if (flags.json) out.write(JSON.stringify({ ok: false, error: lines[0], ...json }, null, 2) + '\n')
  else out.write(lines.join('\n') + '\n')
  return 1
}

// The adapter an `--apply` writes through: the API transport, or one a test
// injects. Releases are API-only, so MCP refuses rather than half-running.
function releaseAdapter(config, flags, verb) {
  const key = resolveApiKey(config, flags.env || process.env)
  const transport = resolveTransport(flags, config, key.ok)
  if (transport !== 'api' && !flags.adapter) {
    return {
      error: [
        `${verb}: refusing to apply over ${transport}.`,
        `  ${key.ok ? '--via api is required' : key.error}`,
        '  Re-run without --apply for the plan.',
      ],
    }
  }
  const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
  const support = releaseSupport(adapter)
  if (!support.supported) {
    return { error: [`${verb}: this provider does not support releases (missing ${support.missing.join(', ')}).`] }
  }
  return { adapter }
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

  const extras = readExtras(dir, flags, verb)
  if (extras.error) return refusal(out, flags, extras.error)
  const { notes, links } = extras

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
    const got = releaseAdapter(config, flags, verb)
    if (got.error) return refusal(out, flags, got.error)
    const { adapter } = got
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

/**
 * Which pipeline and version a `deployed` / `complete` argument names.
 *
 * A full tag (`skitterspec@23.0.1`) names both. A bare version names only the
 * version, and with more than one pipeline declared it is AMBIGUOUS — the same
 * number can be a release in several series. That is answered by `--series`
 * and never by guessing, and deliberately not by asking Linear which pipeline
 * holds it: a dry run makes no network call, and "found in exactly one" would
 * silently change meaning the day a second series reaches that number.
 *
 * `{ untracked: true }` is a tag-shaped argument no pipeline claims — the same
 * healthy no-op `create` answers for it.
 */
function resolveTarget(config, arg, flags, verb) {
  const pipelines = releasePipelines(config)
  if (!pipelines.length) {
    return { error: [`${verb}: no release pipelines are declared.`, `  Add release.pipelines to ${CONFIG_FILE}, or run /spec-linear-setup.`] }
  }
  if (!arg) return { error: [`${verb}: no version given.`, USAGE.trimEnd()] }
  if (flags.series) {
    const pipeline = pipelineForPrefix(config, flags.series)
    if (!pipeline) {
      return {
        error: [
          `${verb}: no pipeline has the series ${JSON.stringify(flags.series)}.`,
          `  Declared: ${pipelines.map((p) => p.tagPrefix).join(', ')}`,
        ],
      }
    }
    const version = arg.startsWith(pipeline.tagPrefix) ? arg.slice(pipeline.tagPrefix.length) : arg
    return version ? { pipeline, version } : { error: [`${verb}: no version given.`] }
  }
  const hit = pipelineForTag(config, arg)
  if (hit) return hit
  if (pipelines.length === 1) {
    // A tag of some other series is not this pipeline's version — `v1.0.0`
    // with one pipeline `app@` is untracked, never version `v1.0.0` of `app@`.
    if (/@/.test(arg)) return { untracked: true }
    return { pipeline: pipelines[0], version: arg }
  }
  if (/@/.test(arg)) return { untracked: true }
  return {
    error: [
      `${verb}: ${JSON.stringify(arg)} is ambiguous — ${pipelines.length} release pipelines are declared.`,
      `  Name the series: --series <${pipelines.map((p) => p.tagPrefix).join('|')}>, or pass the full tag.`,
    ],
  }
}

function untrackedNotice(out, flags, verb, arg, config) {
  const prefixes = releasePipelines(config).map((p) => p.tagPrefix)
  if (flags.json) out.write(JSON.stringify({ ok: true, tracked: false, tag: arg, series: prefixes }, null, 2) + '\n')
  else out.write(`${verb}: ${arg} is not a tracked series (${prefixes.map((p) => `${p}*`).join(', ')}) — nothing to do.\n`)
  return 0
}

// Linear has no release for this version on this pipeline. Asked by exact
// version AND pipeline id, so the lookup could have seen it — an absence here
// means `release create` never ran for it, not a page that was too short.
function missingRelease(out, flags, verb, pipeline, version) {
  return refusal(out, flags, [
    `${verb}: Linear has no release ${version} on ${pipeline.tagPrefix} (pipeline ${pipeline.pipelineId}).`,
    `  Create it first: spec-sync release create ${pipeline.tagPrefix}${version} --apply`,
  ])
}

/**
 * `release deployed <version> <env>` — CI reporting where a release now runs.
 *
 * The env KEY is the host's word for a deploy target (`test`, `prod`); the
 * stage is Linear's. A backwards or skipping move WARNS and still applies: a
 * rollback redeploy is a real event and CI is reporting it, not asking.
 */
async function releaseDeployed(dir, config, positional, flags, out) {
  const verb = 'spec-sync release deployed'
  const [arg, envKey] = positional
  const target = resolveTarget(config, arg, flags, verb)
  if (target.error) return refusal(out, flags, target.error)
  if (target.untracked) return untrackedNotice(out, flags, verb, arg, config)
  const { pipeline, version } = target

  if (!envKey) return refusal(out, flags, [`${verb}: no env given.`, USAGE.trimEnd()])
  const env = envFor(pipeline, envKey)
  if (!env) {
    const keys = pipeline.envs.map((e) => e.key).join(', ') || '(none declared)'
    return refusal(out, flags, [`${verb}: no env named ${JSON.stringify(envKey)} on ${pipeline.tagPrefix}.`, `  Declared: ${keys}`])
  }

  const plan = {
    pipeline: { tagPrefix: pipeline.tagPrefix, pipelineId: pipeline.pipelineId },
    version,
    env: { key: env.key, stage: env.stage },
  }
  const applying = Boolean(flags.apply)
  let before = null
  let after = null
  let warning = null
  if (applying) {
    const got = releaseAdapter(config, flags, verb)
    if (got.error) return refusal(out, flags, got.error)
    try {
      before = await got.adapter.releaseFind({ pipelineId: pipeline.pipelineId, version })
      if (!before) return missingRelease(out, flags, verb, pipeline, version)
      // The ladder warning, reused: envs ARE a ladder of {key, state} rungs.
      // A stage it cannot place (renamed in Linear, or the pipeline's own
      // first stage) is cannot-tell, and stageOrderWarning says nothing.
      const rungs = pipeline.envs.map((e) => ({ key: e.key, state: e.stage }))
      warning = stageOrderWarning(rungs, before.stage && before.stage.name, env.key)
      after = await got.adapter.releaseStage({ pipelineId: pipeline.pipelineId, version, stage: env.stage })
    } catch (error) {
      return refusal(out, flags, [`${verb}: Linear refused — ${describeReleaseRefusal(error).join('\n')}`], { plan })
    }
  }

  if (flags.json) {
    const release = applying
      ? { id: after && after.id, url: (after && after.url) || null, from: (before && before.stage) || null, stage: (after && after.stage) || null }
      : null
    out.write(JSON.stringify({ ok: true, tracked: true, applied: applying, ...plan, warning, release }, null, 2) + '\n')
    return 0
  }
  const lines = [`${verb}: ${pipeline.tagPrefix}${version} → ${env.key} ("${env.stage}")`]
  if (applying) {
    const from = before && before.stage ? before.stage.name : '(unknown)'
    const to = after && after.stage ? after.stage.name : env.stage
    lines.push(`  moved: "${from}" → "${to}"`)
    if (warning) lines.push(`  WARNING ${warning} — applied anyway`)
    if (after && after.url) lines.push(`  ${after.url}`)
  } else {
    lines.push('  dry run — pass --apply to move it in Linear')
  }
  out.write(lines.join('\n') + '\n')
  return 0
}

/**
 * `release complete <version>` — the release is done (for this repo: approved
 * on npm). Idempotent: an already-complete release is reported and not
 * re-sent, so a re-run CI job is a no-op rather than a second write.
 */
async function releaseCompleteVerb(dir, config, positional, flags, out) {
  const verb = 'spec-sync release complete'
  const [arg] = positional
  const target = resolveTarget(config, arg, flags, verb)
  if (target.error) return refusal(out, flags, target.error)
  if (target.untracked) return untrackedNotice(out, flags, verb, arg, config)
  const { pipeline, version } = target

  const extras = readExtras(dir, flags, verb)
  if (extras.error) return refusal(out, flags, extras.error)
  const { notes, links } = extras

  const plan = {
    pipeline: { tagPrefix: pipeline.tagPrefix, pipelineId: pipeline.pipelineId },
    version,
    notes: Boolean(notes),
    links,
  }
  const applying = Boolean(flags.apply)
  let release = null
  let already = false
  if (applying) {
    const got = releaseAdapter(config, flags, verb)
    if (got.error) return refusal(out, flags, got.error)
    try {
      const found = await got.adapter.releaseFind({ pipelineId: pipeline.pipelineId, version })
      if (!found) return missingRelease(out, flags, verb, pipeline, version)
      if (found.completedAt) {
        already = true
        release = found
      } else {
        release = await got.adapter.releaseComplete({ pipelineId: pipeline.pipelineId, version, links, notes })
      }
    } catch (error) {
      return refusal(out, flags, [`${verb}: Linear refused — ${describeReleaseRefusal(error).join('\n')}`], { plan })
    }
  }

  if (flags.json) {
    const result = applying
      ? { id: release && release.id, url: (release && release.url) || null, completedAt: (release && release.completedAt) || null, already }
      : null
    out.write(JSON.stringify({ ok: true, tracked: true, applied: applying, ...plan, release: result }, null, 2) + '\n')
    return 0
  }
  const lines = [`${verb}: ${pipeline.tagPrefix}${version}`]
  if (applying && already) {
    lines.push(`  already complete (${release.completedAt}) — nothing sent`)
    if (links.length || notes) lines.push('  --link / --notes not applied to a completed release')
  } else if (applying) {
    lines.push(`  completed${release && release.completedAt ? ` at ${release.completedAt}` : ''}`)
  } else {
    lines.push('  dry run — pass --apply to complete it in Linear')
  }
  if (!already && links.length) lines.push(`  links: ${links.map((l) => l.label || l.url).join(', ')}`)
  if (!already && notes) lines.push('  notes: attached')
  if (applying && release && release.url) lines.push(`  ${release.url}`)
  out.write(lines.join('\n') + '\n')
  return 0
}

// --- setup: `release pipelines` / `release link` (phase 5) --------------------

// The adapter setup and doctor READ through. Unlike `releaseAdapter` this never
// refuses: no key is an ordinary state for a repo that pushes over MCP, and
// setup degrades to the ladder rather than failing.
function readAdapter(config, flags) {
  if (flags.adapter) return { adapter: flags.adapter }
  const key = resolveApiKey(config, flags.env || process.env)
  if (!key.ok) return { reason: 'no-key', message: key.error || 'no Linear API key' }
  return { adapter: makeApiAdapter({ apiKey: key.key, fetch: flags.fetch }) }
}

/**
 * `release pipelines` — the workspace's release pipelines and their stages, and
 * which tag series each is linked to here. What `/spec-linear-setup` offers.
 *
 * ALWAYS EXITS 0. It answers a question for setup, and every "no" — no key,
 * Releases off for the plan, no pipelines yet — routes setup to the ladder
 * offer rather than failing it. `available` says which:
 *
 *   - `true`     pipelines were listed.
 *   - `false`    Linear REFUSED (feature off, or a key without the scope) — a
 *                positive signal, said in words.
 *   - `unknown`  no key, an unreachable API, or an empty list. EMPTY IS NOT
 *                "Releases is off": Linear answers a read with `[]` when the
 *                feature is off (phase 1), and also when nobody made a pipeline.
 */
async function releasePipelinesVerb(dir, config, flags, out) {
  const linked = new Map(releasePipelines(config).map((p) => [p.pipelineId, p.tagPrefix]))
  const emit = (body, lines) => {
    if (flags.json) out.write(JSON.stringify(body, null, 2) + '\n')
    else out.write(lines.join('\n') + '\n')
    return 0
  }
  const verb = 'spec-sync release pipelines'
  const got = readAdapter(config, flags)
  if (!got.adapter) {
    return emit({ ok: true, available: 'unknown', reason: got.reason, message: got.message, pipelines: [] }, [
      `${verb}: cannot list — ${got.message}`,
      '  Releases are written over the API only; the ladder (release.stages) works without a key.',
    ])
  }
  if (typeof got.adapter.releasePipelines !== 'function') {
    return emit({ ok: true, available: 'unknown', reason: 'unsupported', pipelines: [] }, [
      `${verb}: this transport cannot list release pipelines.`,
    ])
  }
  let list
  try {
    list = await got.adapter.releasePipelines()
  } catch (error) {
    const kind = releaseRefusalKind(error)
    if (kind) {
      return emit({ ok: true, available: false, reason: kind, message: error.message, pipelines: [] }, [
        `${verb}: ${describeReleaseRefusal(error).join('\n')}`,
      ])
    }
    return emit({ ok: true, available: 'unknown', reason: 'unreachable', message: error.message, pipelines: [] }, [
      `${verb}: could not reach Linear — ${error.message}`,
    ])
  }
  const live = list.filter((p) => p && !p.archivedAt)
  const pipelines = live.map((p) => ({ ...p, linkedTo: linked.get(p.id) || null }))
  if (!pipelines.length) {
    return emit({ ok: true, available: 'unknown', reason: 'empty', pipelines: [] }, [
      `${verb}: Linear listed no release pipelines.`,
      '  Create one in Linear (Settings → Releases), then re-run. If Releases is not',
      '  on your plan, Linear answers this same empty list — the ladder still works.',
    ])
  }
  const lines = [`${verb}: ${pipelines.length} pipeline(s)`]
  for (const p of pipelines) {
    lines.push('', `  ${p.name}  (${p.type || 'pipeline'}) ${p.id}${p.linkedTo ? `  ← ${p.linkedTo}` : ''}`)
    lines.push(`    stages: ${p.stages.map((st) => `${st.name} [${st.type}]`).join(' → ') || '(none)'}`)
  }
  return emit({ ok: true, available: true, pipelines }, lines)
}

// `<prefix>=<value>`, split at the LAST `=` so a prefix may hold one; the value
// (a UUID, an env key) never does.
function splitPair(raw) {
  const value = String(raw || '')
  const at = value.lastIndexOf('=')
  if (at <= 0 || at === value.length - 1) return null
  return [value.slice(0, at).trim(), value.slice(at + 1).trim()]
}

/**
 * `release link` — write `release.pipelines` into an EXISTING config.
 *
 * This is the post-connection path: `init-config` refuses a config that exists
 * (re-running setup is a check, not a rewrite), and adopting Releases on a repo
 * already syncing must not cost it its other settings. So this touches
 * `release.pipelines` alone, replaces an entry by tag prefix, keeps the rest,
 * and runs the loader's own merge before writing a byte.
 *
 * Each pipeline id and stage name is checked against Linear when a key is
 * available — a stage Linear does not know fails the first deploy, and a
 * deleted pipeline still resolves by id (with `archivedAt` set). Without a key
 * it writes and says loudly that nothing was checked, exactly as `init-config`
 * does without `--states`.
 */
async function releaseLink(dir, config, flags, out) {
  const verb = 'spec-sync release link'
  const file = path.join(dir, CONFIG_FILE)
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (error) {
    return refusal(out, flags, [`${verb}: cannot read ${CONFIG_FILE} — run /spec-linear-setup first (${error.message}).`])
  }

  const entries = new Map()
  for (const pair of flags.releasePipelines || []) {
    const split = splitPair(pair)
    if (!split) return refusal(out, flags, [`${verb}: --release-pipeline ${JSON.stringify(pair)} is not <prefix>=<pipelineId>.`])
    const [tagPrefix, pipelineId] = split
    if (entries.has(tagPrefix)) return refusal(out, flags, [`${verb}: --release-pipeline ${tagPrefix} given twice.`])
    entries.set(tagPrefix, { tagPrefix, pipelineId, envs: [] })
  }
  if (!entries.size) {
    return refusal(out, flags, [`${verb}: nothing to link — pass --release-pipeline <prefix>=<pipelineId>.`, USAGE.trimEnd()])
  }
  const owner = (prefix, flag) =>
    entries.get(prefix) || { error: [`${verb}: ${flag} names ${JSON.stringify(prefix)}, which no --release-pipeline links.`] }
  for (const pair of flags.releaseEnvs || []) {
    const split = splitPair(pair)
    const colon = split ? split[0].lastIndexOf(':') : -1
    if (!split || colon <= 0) return refusal(out, flags, [`${verb}: --release-env ${JSON.stringify(pair)} is not <prefix>:<env>=<stage>.`])
    const entry = owner(split[0].slice(0, colon), '--release-env')
    if (entry.error) return refusal(out, flags, entry.error)
    entry.envs.push({ key: split[0].slice(colon + 1).trim(), stage: split[1] })
  }
  for (const pair of flags.releaseInitials || []) {
    const split = splitPair(pair)
    if (!split) return refusal(out, flags, [`${verb}: --release-initial ${JSON.stringify(pair)} is not <prefix>=<env>.`])
    const entry = owner(split[0], '--release-initial')
    if (entry.error) return refusal(out, flags, entry.error)
    entry.initialEnv = split[1]
  }

  // Replace by prefix, keep every other series, in their original order.
  const before = Array.isArray(raw.release && raw.release.pipelines) ? raw.release.pipelines : []
  const kept = before.filter((p) => !(p && entries.has(p.tagPrefix)))
  const pipelines = [...kept, ...entries.values()]
  const next = { ...raw, release: { ...(raw.release || {}), pipelines } }
  try {
    mergeConfig(configDefaults(), next)
  } catch (error) {
    return refusal(out, flags, [`${verb}: refusing — ${error.message}`])
  }

  // Against Linear, when we can ask. Each id is READ, never looked for in a
  // listing, so a miss is Linear's answer rather than a short page.
  let validated = false
  let why = null
  const got = readAdapter(config, flags)
  if (got.adapter && typeof got.adapter.releasePipelineRead === 'function') {
    const problems = []
    try {
      for (const entry of entries.values()) {
        const found = await got.adapter.releasePipelineRead(entry.pipelineId)
        if (!found) {
          problems.push(`  ${entry.tagPrefix}: no pipeline ${entry.pipelineId} in this workspace`)
          continue
        }
        if (found.archivedAt) {
          problems.push(`  ${entry.tagPrefix}: pipeline "${found.name}" was deleted (${found.archivedAt})`)
          continue
        }
        const names = new Map(found.stages.map((st) => [st.name.toLowerCase().trim(), st.name]))
        for (const env of entry.envs) {
          if (!names.has(env.stage.toLowerCase().trim())) {
            problems.push(
              `  ${entry.tagPrefix}:${env.key} → "${env.stage}" is not a stage of "${found.name}"` +
                ` (stages: ${found.stages.map((st) => st.name).join(', ') || 'none'})`,
            )
          }
        }
      }
    } catch (error) {
      const kind = releaseRefusalKind(error)
      if (kind) return refusal(out, flags, [`${verb}: Linear refused — ${describeReleaseRefusal(error).join('\n')}`])
      // Unreachable: nothing was checked, which is not the same as wrong.
      why = `could not reach Linear (${error.message})`
    }
    if (problems.length) {
      return refusal(out, flags, [`${verb}: refusing — not what Linear holds:`, ...problems], { problems })
    }
    if (!why) validated = true
  } else {
    why = got.message || 'this transport cannot read pipelines'
  }

  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf-8')

  const ladder = releaseStages(mergeConfig(configDefaults(), next)).length > 0
  if (flags.json) {
    out.write(JSON.stringify({ ok: true, file: CONFIG_FILE, linked: [...entries.values()], validated, unvalidatedWhy: why, ladderAlsoSet: ladder }, null, 2) + '\n')
    return 0
  }
  const lines = [`${verb}: wrote release.pipelines in ${CONFIG_FILE}`]
  for (const entry of entries.values()) {
    const envs = entry.envs.map((e) => `${e.key}="${e.stage}"`).join(', ') || '(no envs)'
    lines.push(`  ${entry.tagPrefix} → ${entry.pipelineId}  ${envs}${entry.initialEnv ? `  initial: ${entry.initialEnv}` : ''}`)
  }
  if (kept.length) lines.push(`  kept ${kept.length} other series: ${kept.map((p) => p.tagPrefix).join(', ')}`)
  lines.push(validated ? '  checked against Linear — pipelines and stages all present' : `  NOT checked against Linear — ${why}`)
  if (ladder) lines.push('  note: release.stages (the ladder) is also set — `spec-sync stage` still uses it')
  out.write(lines.join('\n') + '\n')
  return 0
}

async function specSyncRelease(dir, config, positional, flags, out, deps) {
  const [verb, ...rest] = positional
  switch (verb) {
    case 'create':
      return releaseCreate(dir, config, rest[0], flags, out, deps)
    case 'deployed':
      return releaseDeployed(dir, config, rest, flags, out)
    case 'complete':
      return releaseCompleteVerb(dir, config, rest, flags, out)
    case 'pipelines':
      return releasePipelinesVerb(dir, config, flags, out)
    case 'link':
      return releaseLink(dir, config, flags, out)
    default:
      out.write(USAGE)
      return verb ? 1 : 0
  }
}

module.exports = { specSyncRelease, parseLink, previousTag, refShas, resolveTarget, splitPair, USAGE }
