'use strict'

// release.pipelines — the Linear release pipelines a tag series files into
// (feat-tracker-releases). Validation is loud: a pipeline entry that dropped out
// quietly would turn `release create` into a healthy-looking no-op.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadLinearConfig, releasePipelines, CONFIG_FILE } = require('../src/config.js')

function load(release) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-relpipe-'))
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ linear: { teamKey: 'SKS' }, ...(release ? { release } : {}) }))
  return loadLinearConfig(dir).config
}

const CORE = {
  tagPrefix: 'skitterspec@',
  pipelineId: 'p-core',
  envs: [
    { key: 'staged', stage: 'Staged' },
    { key: 'published', stage: 'Released' },
  ],
  initialEnv: 'staged',
}

test('valid pipelines load with ordered envs and their initial env', () => {
  const config = load({ pipelines: [CORE, { tagPrefix: 'skitterspec-linear@', pipelineId: 'p-linear' }] })
  const [core, linear] = releasePipelines(config)
  assert.deepStrictEqual(core, CORE)
  assert.deepStrictEqual(
    core.envs.map((e) => e.key),
    ['staged', 'published'],
  )
  // envs omitted is an empty ladder, and no initialEnv means the tracker picks.
  assert.deepStrictEqual(linear, { tagPrefix: 'skitterspec-linear@', pipelineId: 'p-linear', envs: [] })
})

// STAYS SILENT: a project that never declared pipelines is unaffected — no
// throw, and the ladder and ignorePaths keep their defaults.
test('an absent release block, or one with only a ladder, means no pipelines', () => {
  assert.deepStrictEqual(releasePipelines(load(null)), [])
  const ladderOnly = load({ stages: [{ key: 'test', state: 'On Test' }] })
  assert.deepStrictEqual(releasePipelines(ladderOnly), [])
  assert.deepStrictEqual(ladderOnly.release.ignorePaths, ['specs/'])
  assert.deepStrictEqual(releasePipelines({}), [])
})

test('two series whose prefixes only share a stem are not an overlap', () => {
  // `skitterspec@` is not a prefix of `skitterspec-linear@` — the `@` differs.
  assert.doesNotThrow(() =>
    load({
      pipelines: [
        { tagPrefix: 'skitterspec@', pipelineId: 'a' },
        { tagPrefix: 'skitterspec-linear@', pipelineId: 'b' },
      ],
    }),
  )
})

const refusals = [
  ['a non-array', { pipelines: {} }, /release\.pipelines = \{\}/],
  ['a missing pipelineId', { pipelines: [{ tagPrefix: 'a@' }] }, /release\.pipelines\[0\]\.pipelineId/],
  ['a blank tagPrefix', { pipelines: [{ tagPrefix: ' ', pipelineId: 'p' }] }, /release\.pipelines\[0\]\.tagPrefix/],
  ['envs as an object', { pipelines: [{ tagPrefix: 'a@', pipelineId: 'p', envs: { a: 'b' } }] }, /envs = /],
  [
    'an env with no stage',
    { pipelines: [{ tagPrefix: 'a@', pipelineId: 'p', envs: [{ key: 'test' }] }] },
    /envs\[0\]\.stage/,
  ],
  [
    'a duplicate env key',
    {
      pipelines: [
        {
          tagPrefix: 'a@',
          pipelineId: 'p',
          envs: [
            { key: 'test', stage: 'A' },
            { key: 'test', stage: 'B' },
          ],
        },
      ],
    },
    /envs\[1\]\.key = "test" \(a duplicate/,
  ],
  [
    'an initialEnv that is not an env key',
    { pipelines: [{ ...CORE, initialEnv: 'prod' }] },
    /initialEnv = "prod" \(expected one of this pipeline's env keys: staged, published\)/,
  ],
  [
    'a duplicate tag prefix',
    {
      pipelines: [
        { tagPrefix: 'a@', pipelineId: 'p' },
        { tagPrefix: 'a@', pipelineId: 'q' },
      ],
    },
    /release\.pipelines\[1\]\.tagPrefix = "a@" \(a duplicate/,
  ],
  [
    'an overlapping tag prefix',
    {
      pipelines: [
        { tagPrefix: 'app@', pipelineId: 'p' },
        { tagPrefix: 'app@beta-', pipelineId: 'q' },
      ],
    },
    /release\.pipelines\[1\]\.tagPrefix = "app@beta-" \(overlaps release\.pipelines\[0\]/,
  ],
]

for (const [what, release, pattern] of refusals) {
  test(`release.pipelines refuses ${what}, naming the field`, () => {
    assert.throws(() => load(release), pattern)
  })
}
