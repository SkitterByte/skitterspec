'use strict'

/**
 * Config-merge machinery shared by every provider's loader.
 *
 * A provider's config is a committed JSON file merged over its own defaults —
 * only known keys copied (unknown ignored for forward-compat), typed fields
 * validated LOUDLY where a typo would otherwise read as a deliberate choice.
 * The defaults, the file name and the vocabularies are the provider's; the
 * merge and validation shapes are identical across providers, so they live
 * here, bound to the provider by `makeMergeHelpers`.
 *
 * Every thrown message names the provider's own config file, so a refusal
 * points at the file the user actually edits.
 */

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

// Normalise an array config value to trimmed, non-empty strings.
function stringList(value) {
  return value.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
}

// Copy a typed field from parsed[key] onto base[key] when it matches `type`.
// Strings are trimmed and must be non-empty to override; `string?` may be empty.
function assign(base, parsed, key, type) {
  const v = parsed[key]
  if (type === 'string') {
    if (typeof v === 'string' && v.trim()) base[key] = v.trim()
  } else if (type === 'string?') {
    if (typeof v === 'string') base[key] = v
  } else if (type === 'boolean') {
    if (typeof v === 'boolean') base[key] = v
  }
}

/**
 * The provider-bound validators. `configFile` is only used in messages;
 * `ownership` / `lifecycleBuckets` / `phaseMappings` are the provider's own
 * vocabularies (they rarely differ between providers, but they are the
 * provider's to declare).
 */
function makeMergeHelpers({ configFile, ownership, lifecycleBuckets, phaseMappings }) {
  // Merge (and validate) sync.fieldOwnership. Any key the caller lists joins
  // the compared field set; the value MUST be one of the ownership modes.
  function mergeFieldOwnership(base, parsed) {
    if (!isObject(parsed)) return
    for (const [field, dir] of Object.entries(parsed)) {
      if (!ownership.includes(dir)) {
        throw new Error(
          `Invalid ${configFile}: sync.fieldOwnership.${field} = ${JSON.stringify(dir)} ` +
            `(expected one of ${ownership.join('|')})`,
        )
      }
      base[field] = dir
    }
  }

  // Merge (and validate) `mapping.phases` in either of its two forms: a scalar
  // mode for the whole repo, or a map of lifecycle bucket → mode. Loud on a bad
  // key or value — a misspelt bucket would otherwise read as a deliberate
  // default and go on minting the sub-issues the config was written to stop.
  function mergePhaseMapping(base, parsed) {
    const value = parsed.phases
    if (typeof value === 'string') {
      if (value.trim()) base.phases = value.trim()
    } else if (isObject(value)) {
      const byBucket = {}
      for (const [bucket, mode] of Object.entries(value)) {
        if (!lifecycleBuckets.includes(bucket)) {
          throw new Error(
            `Invalid ${configFile}: mapping.phases.${bucket} is not a lifecycle bucket ` +
              `(expected one of ${lifecycleBuckets.join('|')})`,
          )
        }
        if (!phaseMappings.includes(mode)) {
          throw new Error(
            `Invalid ${configFile}: mapping.phases.${bucket} = ${JSON.stringify(mode)} ` +
              `(expected one of ${phaseMappings.join('|')})`,
          )
        }
        byBucket[bucket] = mode
      }
      base.phases = byBucket
    } else if (value !== undefined) {
      throw new Error(
        `Invalid ${configFile}: mapping.phases = ${JSON.stringify(value)} ` +
          `(expected one of ${phaseMappings.join('|')}, or a map of lifecycle bucket to mode)`,
      )
    }
    if (typeof base.phases === 'string' && !phaseMappings.includes(base.phases)) {
      throw new Error(
        `Invalid ${configFile}: mapping.phases = ${JSON.stringify(base.phases)} ` +
          `(expected one of ${phaseMappings.join('|')}, or a map of lifecycle bucket to mode)`,
      )
    }
  }

  // Merge (and validate) `release.stages` — the project's deployment ladder.
  //
  // Loud on a malformed entry: this list names tracker states, and a tracker
  // that silently ignores an unknown state would let a half-typed ladder push
  // clean and move nothing — so a bad shape fails here, at load, rather than at
  // the first deploy nobody is watching. An ABSENT `release` block is not an
  // error: it is the opt-out, and the whole feature is unused without it.
  function mergeReleaseStages(base, parsed) {
    const value = parsed.stages
    if (value === undefined) return
    if (!Array.isArray(value)) {
      throw new Error(
        `Invalid ${configFile}: release.stages = ${JSON.stringify(value)} ` +
          '(expected an array of { key, state })',
      )
    }
    const stages = []
    const seen = new Set()
    value.forEach((entry, i) => {
      if (!isObject(entry)) {
        throw new Error(
          `Invalid ${configFile}: release.stages[${i}] = ${JSON.stringify(entry)} ` +
            '(expected { key, state })',
        )
      }
      for (const field of ['key', 'state']) {
        if (typeof entry[field] !== 'string' || !entry[field].trim()) {
          throw new Error(
            `Invalid ${configFile}: release.stages[${i}].${field} = ${JSON.stringify(entry[field])} ` +
              '(expected a non-empty string)',
          )
        }
      }
      const key = entry.key.trim()
      if (seen.has(key)) {
        throw new Error(
          `Invalid ${configFile}: release.stages[${i}].key = ${JSON.stringify(key)} is a duplicate ` +
            '(a stage key is how CI names the rung, so it must be unique)',
        )
      }
      seen.add(key)
      stages.push({ key, state: entry.state.trim() })
    })
    base.stages = stages
  }

  // Merge (and validate) release.ignorePaths — the path prefixes whose commits
  // are bookkeeping. Loud on anything but an array of non-empty strings: a bad
  // value that quietly fell back would let a project believe it had opted out
  // and go on double-counting tickets. A BLANK entry is rejected rather than
  // dropped — `""` is a prefix of every path, so a stray empty string would
  // silently ignore every commit in the range and report a release as
  // containing nothing: the loudest possible wrong answer, arriving as silence.
  function mergeReleaseIgnorePaths(base, parsed) {
    const value = parsed.ignorePaths
    if (value === undefined) return
    if (!Array.isArray(value)) {
      throw new Error(
        `Invalid ${configFile}: release.ignorePaths = ${JSON.stringify(value)} ` +
          '(expected an array of repo-relative path prefixes)',
      )
    }
    value.forEach((entry, i) => {
      if (typeof entry !== 'string' || !entry.trim()) {
        throw new Error(
          `Invalid ${configFile}: release.ignorePaths[${i}] = ${JSON.stringify(entry)} ` +
            '(expected a non-empty repo-relative path prefix, e.g. "specs/")',
        )
      }
    })
    base.ignorePaths = stringList(value)
  }

  // Merge (and validate) sync.keyedFields. Each value is the item's id property
  // name (a non-empty string); a field listed here is compared per item.
  function mergeKeyedFields(base, parsed) {
    if (!isObject(parsed)) return
    for (const [field, idKey] of Object.entries(parsed)) {
      if (typeof idKey !== 'string' || !idKey.trim()) {
        throw new Error(
          `Invalid ${configFile}: sync.keyedFields.${field} = ${JSON.stringify(idKey)} ` +
            '(expected the item id property name, a non-empty string)',
        )
      }
      base[field] = idKey.trim()
    }
  }

  // Merge (and validate) release.pipelines — the tracker release pipelines a
  // tag series files into. Each entry is
  //   { tagPrefix, pipelineId, envs: [{ key, stage }], initialEnv? }
  // and loud on every malformation, for the same reason as `stages`: a pipeline
  // entry that quietly dropped out would make `release create` report a tag as
  // "not a tracked series" — a healthy-looking no-op standing in for a typo.
  //
  // `envs` is ORDERED (deployment order), which is what lets a backwards move
  // warn. `initialEnv` names the stage a new release lands on: without it the
  // tracker picks (Linear: the first `started` stage by position, which is not a
  // custom stage the team added — phase 1 of feat-tracker-releases).
  //
  // A prefix that is a prefix of ANOTHER is refused, not resolved: `app@` and
  // `app@beta-` would both claim `app@beta-1`, and whichever the reader assumes
  // wins is a guess the config should not leave them to make.
  function mergeReleasePipelines(base, parsed) {
    const value = parsed.pipelines
    if (value === undefined) return
    const where = (i, field) => `release.pipelines[${i}]${field ? `.${field}` : ''}`
    const bad = (at, v, expected) =>
      new Error(`Invalid ${configFile}: ${at} = ${JSON.stringify(v)} (${expected})`)
    if (!Array.isArray(value)) {
      throw bad('release.pipelines', value, 'expected an array of { tagPrefix, pipelineId, envs }')
    }
    const pipelines = value.map((entry, i) => {
      if (!isObject(entry)) throw bad(where(i), entry, 'expected { tagPrefix, pipelineId, envs }')
      for (const field of ['tagPrefix', 'pipelineId']) {
        if (typeof entry[field] !== 'string' || !entry[field].trim()) {
          throw bad(where(i, field), entry[field], 'expected a non-empty string')
        }
      }
      const envsIn = entry.envs === undefined ? [] : entry.envs
      if (!Array.isArray(envsIn)) throw bad(where(i, 'envs'), envsIn, 'expected an array of { key, stage }')
      const seen = new Set()
      const envs = envsIn.map((env, j) => {
        if (!isObject(env)) throw bad(where(i, `envs[${j}]`), env, 'expected { key, stage }')
        for (const field of ['key', 'stage']) {
          if (typeof env[field] !== 'string' || !env[field].trim()) {
            throw bad(where(i, `envs[${j}].${field}`), env[field], 'expected a non-empty string')
          }
        }
        const key = env.key.trim()
        if (seen.has(key)) {
          throw bad(where(i, `envs[${j}].key`), key, 'a duplicate — CI names the environment by its key')
        }
        seen.add(key)
        return { key, stage: env.stage.trim() }
      })
      const pipeline = { tagPrefix: entry.tagPrefix.trim(), pipelineId: entry.pipelineId.trim(), envs }
      if (entry.initialEnv !== undefined) {
        const initial = typeof entry.initialEnv === 'string' ? entry.initialEnv.trim() : ''
        if (!seen.has(initial)) {
          const keys = [...seen].join(', ') || '(none declared)'
          throw bad(where(i, 'initialEnv'), entry.initialEnv, `expected one of this pipeline's env keys: ${keys}`)
        }
        pipeline.initialEnv = initial
      }
      return pipeline
    })
    pipelines.forEach((a, i) => {
      pipelines.forEach((b, j) => {
        if (i === j) return
        if (a.tagPrefix === b.tagPrefix && i < j) {
          throw bad(where(j, 'tagPrefix'), b.tagPrefix, 'a duplicate — a tag can belong to one pipeline')
        }
        if (a.tagPrefix !== b.tagPrefix && b.tagPrefix.startsWith(a.tagPrefix)) {
          throw bad(
            where(j, 'tagPrefix'),
            b.tagPrefix,
            `overlaps release.pipelines[${i}].tagPrefix ${JSON.stringify(a.tagPrefix)} — a tag starting with it would match both`,
          )
        }
      })
    })
    base.pipelines = pipelines
  }

  return {
    mergeFieldOwnership,
    mergePhaseMapping,
    mergeReleaseStages,
    mergeReleaseIgnorePaths,
    mergeReleasePipelines,
    mergeKeyedFields,
  }
}

module.exports = { isObject, stringList, assign, makeMergeHelpers }
