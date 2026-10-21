'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const {
  RELEASE_OPS,
  releaseSupport,
  pipelineForTag,
  pipelineForPrefix,
  envFor,
  unattachedRefs,
} = require('../src/releases.js')

const CONFIG = {
  release: {
    pipelines: [
      { tagPrefix: 'skitterspec@', pipelineId: 'p-core', envs: [{ key: 'staged', stage: 'Staged' }] },
      { tagPrefix: 'skitterspec-linear@', pipelineId: 'p-linear', envs: [] },
    ],
  },
}

// --- releaseSupport -----------------------------------------------------------

test('an adapter with every release op is supported', () => {
  const adapter = Object.fromEntries(RELEASE_OPS.map((op) => [op, async () => null]))
  assert.deepStrictEqual(releaseSupport(adapter), { supported: true, missing: [] })
})

test('a provider without releases is unsupported and names what it lacks', () => {
  const adapter = { readIssue: async () => null, releaseFind: async () => null }
  const support = releaseSupport(adapter)
  assert.strictEqual(support.supported, false)
  assert.deepStrictEqual(support.missing, ['releaseSync', 'releaseStage', 'releaseComplete'])
})

// --- pipelineForTag -----------------------------------------------------------

test('a tag resolves to its pipeline and the version after the prefix', () => {
  const hit = pipelineForTag(CONFIG, 'skitterspec@23.0.1')
  assert.strictEqual(hit.pipeline.pipelineId, 'p-core')
  assert.strictEqual(hit.version, '23.0.1')
  assert.strictEqual(pipelineForTag(CONFIG, 'skitterspec-linear@18.0.1').pipeline.pipelineId, 'p-linear')
})

test('a hotfix tag keeps its whole suffix as the version', () => {
  assert.strictEqual(pipelineForTag(CONFIG, 'skitterspec@23.0.1-hotfix.1').version, '23.0.1-hotfix.1')
})

// STAYS SILENT (negative-checks rule 3): a tag nobody configured is an ordinary
// state, not an error — it answers null and the caller reports it.
test('an untracked tag, a bare prefix and a config with no pipelines all answer null', () => {
  assert.strictEqual(pipelineForTag(CONFIG, 'v1.2.3'), null)
  assert.strictEqual(pipelineForTag(CONFIG, 'skitterspec@'), null)
  assert.strictEqual(pipelineForTag({}, 'skitterspec@1.0.0'), null)
  assert.strictEqual(pipelineForTag({ release: {} }, 'skitterspec@1.0.0'), null)
  assert.strictEqual(pipelineForTag(CONFIG, ''), null)
  assert.strictEqual(pipelineForTag(CONFIG, undefined), null)
})

test('the longest matching prefix wins if an overlap ever reaches it', () => {
  const overlapping = {
    release: {
      pipelines: [
        { tagPrefix: 'app@', pipelineId: 'short', envs: [] },
        { tagPrefix: 'app@beta-', pipelineId: 'long', envs: [] },
      ],
    },
  }
  assert.strictEqual(pipelineForTag(overlapping, 'app@beta-1').pipeline.pipelineId, 'long')
  assert.strictEqual(pipelineForTag(overlapping, 'app@1.0.0').pipeline.pipelineId, 'short')
})

test('pipelineForPrefix and envFor look up by exact key', () => {
  const pipeline = pipelineForPrefix(CONFIG, 'skitterspec@')
  assert.strictEqual(pipeline.pipelineId, 'p-core')
  assert.strictEqual(pipelineForPrefix(CONFIG, 'skitter'), null)
  assert.deepStrictEqual(envFor(pipeline, 'staged'), { key: 'staged', stage: 'Staged' })
  assert.strictEqual(envFor(pipeline, 'prod'), null)
  assert.strictEqual(envFor(null, 'staged'), null)
})

// --- unattachedRefs -----------------------------------------------------------

test('a ref the tracker did not attach is named', () => {
  assert.deepStrictEqual(unattachedRefs(['SKS-41', 'SKS-401'], { issues: ['SKS-401'] }), ['SKS-41'])
})

test('every ref attached answers an empty list, case-insensitively and once per ref', () => {
  assert.deepStrictEqual(unattachedRefs(['sks-401', 'SKS-401'], { issues: ['SKS-401'] }), [])
  assert.deepStrictEqual(unattachedRefs([], { issues: [] }), [])
})

// CANNOT TELL (negative-checks rule 4): a release read back without its issues
// must not be reported as having dropped every ref.
test('a release with no issues read back is cannot-tell, not "all dropped"', () => {
  assert.strictEqual(unattachedRefs(['SKS-1'], { id: 'r' }), null)
  assert.strictEqual(unattachedRefs(['SKS-1'], null), null)
})
