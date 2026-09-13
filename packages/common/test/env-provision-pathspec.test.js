'use strict'

/**
 * THE INVARIANT: every commit this workflow plans is bounded by a pathspec.
 *
 * Naming the paths in `git add` is necessary and not sufficient. A checkout has
 * ONE `.git/index` and every session standing in it shares that index, so a bare
 * `git commit` takes whatever another session has already staged — however
 * exactly this one named its own paths. The `--` on the COMMIT is what bounds
 * what lands, and a change that drops it would leave the naming as decoration
 * while every test about the paths themselves went on passing.
 *
 * That is why this asserts the SHAPE of the commit rather than its contents: the
 * failure it guards against is silent in a diff and invisible to the path tests.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planSpecCommit } = require('../src/env/provision.js')

const SPEC = {
  slug: 'thing',
  folder: 'feat-thing',
  bucket: 'backlog',
  path: '/repo/specs/backlog/feat-thing',
  type: 'feat',
}

const commitOf = (commands) => commands.find((c) => c.startsWith('git commit'))
const addOf = (commands) => commands.find((c) => c.startsWith('git add'))

test('the planned commit carries a pathspec, not just the add', () => {
  const plan = planSpecCommit(SPEC, { dirtyPaths: ['specs/backlog/feat-thing'] }, {})
  assert.strictEqual(plan.blocked, false)

  const commit = commitOf(plan.commands)
  assert.ok(commit, `a commit was planned: ${JSON.stringify(plan.commands)}`)
  assert.ok(
    commit.includes(' -- '),
    `the commit is pathspec-limited, or another session's index rides along: ${commit}`,
  )
})

test('add and commit are limited to the same paths', () => {
  const dirtyPaths = [
    'specs/backlog/feat-thing/00-overview.md',
    'specs/backlog/feat-thing/01-x.md',
  ]
  const plan = planSpecCommit(SPEC, { dirtyPaths }, {})

  const after = (cmd) => cmd.slice(cmd.indexOf(' -- ') + 4).trim()
  assert.strictEqual(
    after(addOf(plan.commands)),
    after(commitOf(plan.commands)),
    'a commit bounded by a different set than was staged commits the wrong thing',
  )
  for (const p of dirtyPaths) {
    assert.ok(commitOf(plan.commands).includes(`"${p}"`), `${p} is in the commit's pathspec`)
  }
})

// Both halves are needed and they answer different failures: `git commit` cannot
// take a path git has never seen, which is every brand-new spec folder, so the
// `add` cannot be dropped in favour of the pathspec alone.
test('the add survives — a pathspec alone cannot commit an untracked path', () => {
  const plan = planSpecCommit(SPEC, { dirtyPaths: ['specs/backlog/feat-thing'] }, {})
  assert.ok(addOf(plan.commands), `an add is still planned: ${JSON.stringify(plan.commands)}`)
  assert.ok(addOf(plan.commands).includes(' -- '), 'the add names its paths after `--` too')
})

// STAYS-SILENT: a clean tree plans no commit at all, so there is no pathspec to
// assert and nothing to complain about.
test('a clean tree plans no commit, and says nothing about pathspecs', () => {
  const plan = planSpecCommit(SPEC, { dirtyPaths: [] }, {})
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [])
})
