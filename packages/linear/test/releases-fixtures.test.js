'use strict'

// Pins the Linear release-API behaviour observed in the feat-tracker-releases
// spike (phase 1). Phase 2's adapter is built on these facts; a fixture edited
// to contradict one of them should fail here first, not in the adapter tests.

const test = require('node:test')
const assert = require('node:assert/strict')
const fx = require('./fixtures/releases.json')

test('a scheduled pipeline keeps one release per version', () => {
  const a = fx.syncFirstVersion.releaseSync.release
  const b = fx.syncSecondVersion.releaseSync.release
  assert.notEqual(a.id, b.id)
  assert.equal(a.version, '0.0.1-spike')
  assert.equal(b.version, '0.0.2-spike')
})

test('re-syncing a version returns the same release, so a CI retry is not a duplicate', () => {
  assert.equal(fx.syncRetrySameVersion.releaseSync.release.id, fx.syncFirstVersion.releaseSync.release.id)
})

test('an unresolvable ref reports success and attaches nothing, so attaches must be read back', () => {
  const r = fx.syncUnresolvableRef
  assert.equal(r.releaseSync.success, true)
  assert.deepEqual(r.releaseSync.release.issues.nodes, [])
  assert.equal(r._sent.issueReferences.length, 1)
})

test('a resolvable ref is attached by the sync itself', () => {
  const ids = fx.syncResolvableRef.releaseSync.release.issues.nodes.map((n) => n.identifier)
  assert.deepEqual(ids, ['SKS-401'])
})

test('stage names match case-insensitively on updateByPipeline', () => {
  const r = fx.updateByPipelineStage
  assert.equal(r._sent.stage, 'staged')
  assert.equal(r.releaseUpdateByPipeline.release.stage.name, 'Staged')
})

test('a new scheduled pipeline ships one stage of each type', () => {
  const types = fx.pipelineCreate.releasePipelineCreate.releasePipeline.stages.nodes.map((s) => s.type).sort()
  assert.deepEqual(types, ['canceled', 'completed', 'planned', 'started'])
})

test('a version lookup with no match is an empty list, not an error', () => {
  assert.deepEqual(fx.findByVersionMissing.releases.nodes, [])
  assert.equal(fx.findByVersion.releases.nodes.length, 1)
})
