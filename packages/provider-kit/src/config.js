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

  // Merge (and validate) `states`. A bucket's value is a string — the one state
  // push writes, exactly as it always was — or a non-empty array whose FIRST
  // name is the one push writes and whose rest are read-only aliases: tracker
  // states that also mean this bucket ("Blocked" for in-progress). The first
  // name lands in `states[bucket]`, so every writer is unchanged; the rest go
  // to `stateAliases[bucket]`, read only by code that interprets a remote state.
  //
  // An ALIAS in two buckets is refused: it would make a remote state mean two
  // things, and which one won would be an accident of iteration order. Two
  // buckets sharing one written name stays legal, as it always was — a tracker
  // with no Cancelled state maps cancelled to "Done" — so only a name that an
  // alias contributes is checked.
  function mergeStates(base, parsed) {
    const value = parsed.states
    if (!isObject(value)) return
    const aliases = {}
    for (const bucket of Object.keys(base.states)) {
      const entry = value[bucket]
      if (entry === undefined) continue
      if (typeof entry === 'string') {
        if (entry.trim()) base.states[bucket] = entry.trim()
        continue
      }
      if (!Array.isArray(entry) || !entry.length || entry.some((n) => typeof n !== 'string' || !n.trim())) {
        throw new Error(
          `Invalid ${configFile}: states.${bucket} = ${JSON.stringify(entry)} ` +
            '(expected a state name, or a non-empty array of them — the first is what push writes)',
        )
      }
      const names = entry.map((n) => n.trim())
      base.states[bucket] = names[0]
      aliases[bucket] = names.slice(1)
    }
    const owner = new Map()
    for (const bucket of Object.keys(base.states)) {
      const key = base.states[bucket].toLowerCase()
      if (!owner.has(key)) owner.set(key, bucket)
    }
    for (const bucket of Object.keys(aliases)) {
      for (const name of aliases[bucket]) {
        const key = name.toLowerCase()
        if (owner.has(key) && owner.get(key) !== bucket) {
          throw new Error(
            `Invalid ${configFile}: states name ${JSON.stringify(name)} is in both ` +
              `${owner.get(key)} and ${bucket} (a tracker state can mean only one bucket)`,
          )
        }
        owner.set(key, bucket)
      }
    }
    base.stateAliases = aliases
  }

  return {
    mergeStates,
    mergeFieldOwnership,
    mergePhaseMapping,
    mergeReleaseStages,
    mergeReleaseIgnorePaths,
    mergeKeyedFields,
  }
}

// Keys no provider reads any more. The merge already ignores them, as it does
// every unknown key — so a config still carrying one is a stale file, not a
// broken one, and `doctor` says so as a `warn` without touching the exit code.
//
// WHAT WOULD FOOL THIS: it reads the committed file, so a key set only in a
// working-tree edit is still reported — which is the file a person would edit.
const RETIRED_KEYS = Object.freeze([{ path: ['releases'], name: 'releases' }])

// The retired keys present in a parsed config. Not an object, or none present,
// is `[]`: nothing to say is the safe answer to every cannot-tell.
function retiredKeys(parsed) {
  if (!isObject(parsed)) return []
  return RETIRED_KEYS.filter(({ path }) => {
    let node = parsed
    for (const key of path) {
      if (!isObject(node) || !(key in node)) return false
      node = node[key]
    }
    return true
  }).map((k) => k.name)
}

// A doctor row naming the retired keys in the config at `file`, or null when
// there are none — or when the file cannot be read or parsed, which is the
// loader's to report, not this row's.
function retiredKeysRow(file, configFile, row) {
  let parsed = null
  try {
    parsed = JSON.parse(require('node:fs').readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
  const names = retiredKeys(parsed)
  if (!names.length) return null
  return row(
    'retired',
    'Retired config',
    'warn',
    `${names.join(', ')} in ${configFile} is no longer read — release and deploy state is the host project's to write (see \`spec-sync released --json\`)`,
    `remove ${names.join(', ')} from ${configFile}`,
  )
}

module.exports = { isObject, stringList, assign, makeMergeHelpers, retiredKeys, retiredKeysRow, RETIRED_KEYS }
