'use strict'

// The decision behind release.yml's Windows gate (chore-release-ci-test-dedup).
// Every way to skip the suite is a positive signal, so most cases here are the
// shapes that must NOT skip it.

const { test } = require('node:test')
const assert = require('node:assert')

const { equivalent, windowsState, decide } = require('./windows-gate.cjs')

const manifest = (pkg, from, to) =>
  [
    `diff --git a/packages/${pkg}/package.json b/packages/${pkg}/package.json`,
    'index 1111111..2222222 100644',
    `--- a/packages/${pkg}/package.json`,
    `+++ b/packages/${pkg}/package.json`,
    '@@ -3 +3 @@',
    `-  "version": "${from}",`,
    `+  "version": "${to}",`,
    '',
  ].join('\n')

const notes = (name) =>
  [
    `diff --git a/RELEASES-${name}.md b/RELEASES-${name}.md`,
    'index 1111111..2222222 100644',
    `--- a/RELEASES-${name}.md`,
    `+++ b/RELEASES-${name}.md`,
    '@@ -1,0 +2,3 @@',
    '+## 3.2.2',
    '+',
    '+- Something users notice',
    '',
  ].join('\n')

// --- equivalent ------------------------------------------------------------

test('an empty diff is the same tree', () => {
  assert.strictEqual(equivalent(''), true)
})

test('a batch release commit is equivalent: versions and notes only', () => {
  const diff = manifest('skitterspec-github', '3.2.1', '3.2.2') + notes('skitterspec-github') + manifest('skitterspec-jira', '3.2.1', '3.2.2')
  assert.strictEqual(equivalent(diff), true)
})

test('a version line plus any other manifest line is not equivalent', () => {
  const diff = manifest('skitterspec', '23.24.1', '23.24.2').replace('@@ -3 +3 @@', '@@ -3,2 +3,2 @@') +
    '-  "description": "old",\n+  "description": "new",\n'
  assert.strictEqual(equivalent(diff), false)
})

test('a code change is not equivalent', () => {
  const diff = notes('skitterspec') +
    'diff --git a/packages/common/src/x.js b/packages/common/src/x.js\n--- a/packages/common/src/x.js\n+++ b/packages/common/src/x.js\n@@ -1 +1 @@\n-a\n+b\n'
  assert.strictEqual(equivalent(diff), false)
})

test('a package.json outside packages/*/ is not equivalent', () => {
  assert.strictEqual(equivalent(manifest('x', '1.0.0', '1.0.1').replace(/packages\/x\//g, '')), false)
  assert.strictEqual(equivalent(manifest('a/b', '1.0.0', '1.0.1')), false)
})

test('a RELEASES file below the root is not equivalent', () => {
  assert.strictEqual(equivalent(notes('x').replace(/RELEASES-x\.md/g, 'docs/RELEASES-x.md')), false)
})

test('a manifest that is new, renamed or mode-changed is not equivalent', () => {
  assert.strictEqual(equivalent(manifest('x', '1.0.0', '1.0.1').replace('index', 'new file mode 100644\nindex')), false)
  assert.strictEqual(equivalent(manifest('x', '1.0.0', '1.0.1').replace('index', 'old mode 100644\nnew mode 100755\nindex')), false)
})

test('a manifest section with no changed lines is not equivalent', () => {
  const diff = 'diff --git a/packages/x/package.json b/packages/x/package.json\nindex 1..2 100644\n'
  assert.strictEqual(equivalent(diff), false)
})

// --- windowsState ----------------------------------------------------------

const job = (status, conclusion) => [{ name: 'windows (node 24)', status, conclusion }]

test('a finished green Windows job is success', () => {
  assert.strictEqual(windowsState({ status: 'completed' }, job('completed', 'success')), 'success')
})

test('a Windows job still going, or not created yet, is pending', () => {
  assert.strictEqual(windowsState({ status: 'in_progress' }, job('in_progress', null)), 'pending')
  assert.strictEqual(windowsState({ status: 'in_progress' }, []), 'pending')
})

test('a finished run with no Windows job is missing, not success', () => {
  assert.strictEqual(windowsState({ status: 'completed' }, [{ name: 'test (node 24)', status: 'completed', conclusion: 'success' }]), 'missing')
})

test('a skipped Windows job is not success', () => {
  // A release run whose own gate adopted something has a skipped Windows job;
  // it proves nothing about the tree.
  assert.strictEqual(windowsState({ status: 'completed' }, job('completed', 'skipped')), 'skipped')
})

// --- decide ----------------------------------------------------------------

test('an equivalent green run is adopted', () => {
  const d = decide([{ url: 'u1', windows: 'failure' }, { url: 'u2', windows: 'success' }])
  assert.deepStrictEqual([d.action, d.adopted], ['adopt', 'u2'])
})

test('main still testing Windows means wait, not run', () => {
  // The stays-silent case: a batch's tags start while main's CI run is going.
  // Running here is the duplication this gate exists to remove.
  assert.strictEqual(decide([{ url: 'main', windows: 'pending' }]).action, 'wait')
})

test('no candidates runs the suite', () => {
  assert.strictEqual(decide([]).action, 'run')
})

test('red, cancelled, skipped and missing all run the suite', () => {
  for (const windows of ['failure', 'cancelled', 'skipped', 'missing', 'timed_out']) {
    assert.strictEqual(decide([{ url: 'u', windows }]).action, 'run', windows)
  }
})
