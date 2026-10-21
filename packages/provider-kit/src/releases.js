'use strict'

/**
 * The provider-neutral half of tracker releases: the op contract a provider's
 * adapter fulfils to support `spec-sync release`, and the pure lookups every
 * provider needs over `release.pipelines` — which pipeline a tag belongs to, and
 * which tracker stage an environment key means.
 *
 * The release ops are OPTIONAL. They are feature-detected with `missingOps`
 * rather than added to a provider's required set, because a tracker may have no
 * releases at all (or a plan that lacks them), and that must read as "this
 * provider does not do releases", never as a broken adapter.
 *
 * Nothing in here names a tracker. The provider maps its own API onto these ops:
 *
 *   releaseFind({ pipelineId, version })                       → release | null
 *   releaseSync({ pipelineId, version, name, commitSha, refs,
 *                 links, notes })                              → release
 *   releaseStage({ pipelineId, version, stage })               → release
 *   releaseComplete({ pipelineId, version, links, notes })     → release
 *
 * `releaseSync` is create-or-update keyed by version, and attaches `refs` in the
 * same call — Linear's `releaseSync` does exactly that (phase 1 of
 * feat-tracker-releases), and a provider without one composes it from a find, a
 * create and per-issue attaches. A returned release carries `issues` (the
 * identifiers actually attached), so a caller can read back what the tracker
 * accepted rather than trusting what it sent.
 */

const { missingOps } = require('./adapter.js')

const RELEASE_OPS = Object.freeze(['releaseFind', 'releaseSync', 'releaseStage', 'releaseComplete'])

/**
 * Whether an adapter supports releases. `{ supported, missing }` — `missing` is
 * what a refusal names, so a half-implemented provider says which op it lacks.
 */
function releaseSupport(adapter) {
  const missing = missingOps(RELEASE_OPS, adapter)
  return { supported: missing.length === 0, missing }
}

function pipelinesOf(config) {
  const pipelines = config && config.release && config.release.pipelines
  return Array.isArray(pipelines) ? pipelines : []
}

/**
 * The pipeline a tag belongs to, and the version it carries.
 *
 * `null` means "not a tracked series" — a tag nobody configured a pipeline for is
 * an ordinary state (a repo can tag things it does not release to a tracker), so
 * the caller reports it rather than failing. Config validation refuses a prefix
 * that is a prefix of another, so at most one entry can match; the longest-match
 * rule below is what would still pick correctly if an older config slipped one
 * through.
 *
 * An empty remainder (`skitterspec@` alone) is not a version and matches nothing.
 */
function pipelineForTag(config, tag) {
  const name = typeof tag === 'string' ? tag.trim() : ''
  if (!name) return null
  let best = null
  for (const pipeline of pipelinesOf(config)) {
    const prefix = pipeline && pipeline.tagPrefix
    if (!prefix || !name.startsWith(prefix) || name.length === prefix.length) continue
    if (!best || prefix.length > best.pipeline.tagPrefix.length) {
      best = { pipeline, version: name.slice(prefix.length) }
    }
  }
  return best
}

/** The pipeline with this tag prefix, or null. */
function pipelineForPrefix(config, prefix) {
  return pipelinesOf(config).find((p) => p.tagPrefix === prefix) || null
}

/** The environment with this key on a pipeline, or null. */
function envFor(pipeline, key) {
  const envs = (pipeline && Array.isArray(pipeline.envs) && pipeline.envs) || []
  return envs.find((e) => e.key === key) || null
}

/**
 * The sent refs the tracker did not attach.
 *
 * Linear answers `success: true` to a sync whose ref it could not resolve and
 * attaches nothing (phase 1: an issue it no longer finds) — so a caller that
 * trusted the success flag would report a release as holding a ticket it does
 * not. This compares what was sent with what the release now holds.
 *
 * Case-insensitive, because identifiers are, and a release whose `issues` the
 * adapter did not return (`undefined`) is CANNOT TELL: it yields `null` rather
 * than claiming every ref was dropped.
 */
function unattachedRefs(sent, release) {
  const held = release && Array.isArray(release.issues) ? release.issues : null
  if (!held) return null
  const have = new Set(held.map((id) => String(id).toUpperCase()))
  return [...new Set((sent || []).map((r) => String(r)))].filter((ref) => !have.has(ref.toUpperCase()))
}

module.exports = { RELEASE_OPS, releaseSupport, pipelineForTag, pipelineForPrefix, envFor, unattachedRefs }
