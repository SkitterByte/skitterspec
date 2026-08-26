'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planPrune } = require('../src/env/prune.js')

const REPO = 'skitterspec'
const names = (plan) => plan.orphans.map((o) => o.name)

test('reaps a true orphan in the namespace', () => {
  const plan = planPrune([`${REPO}_gone_db-data`], [], { repoSlug: REPO })
  assert.deepStrictEqual(names(plan), [`${REPO}_gone_db-data`])
  assert.deepStrictEqual(plan.commands, [`docker volume rm ${REPO}_gone_db-data`])
})

test('protects a live slug', () => {
  const plan = planPrune([`${REPO}_alive_db-data`], ['alive'], { repoSlug: REPO })
  assert.deepStrictEqual(names(plan), [])
  assert.deepStrictEqual(plan.commands, [])
})

test('exact-prefix safety — "add" does not protect "add-widget"', () => {
  const plan = planPrune(
    [`${REPO}_add_db-data`, `${REPO}_add-widget_db-data`],
    ['add'],
    { repoSlug: REPO },
  )
  // add is live → protected; add-widget is a distinct orphan and must be reaped.
  assert.deepStrictEqual(names(plan), [`${REPO}_add-widget_db-data`])
})

test('ignores volumes outside the repo namespace', () => {
  const plan = planPrune(
    [`otherrepo_thing_db-data`, `${REPO}_gone_db-data`, `unrelated-volume`],
    [],
    { repoSlug: REPO },
  )
  assert.deepStrictEqual(names(plan), [`${REPO}_gone_db-data`])
})

test('empty inputs are a clean no-op', () => {
  assert.deepStrictEqual(planPrune([], [], { repoSlug: REPO }), { orphans: [], commands: [] })
  assert.deepStrictEqual(planPrune(undefined, undefined, { repoSlug: REPO }), {
    orphans: [],
    commands: [],
  })
})

test('accepts a Set of live slugs and multiple orphans', () => {
  const plan = planPrune(
    [`${REPO}_a_db`, `${REPO}_b_db`, `${REPO}_c_db`],
    new Set(['b']),
    { repoSlug: REPO },
  )
  assert.deepStrictEqual(names(plan), [`${REPO}_a_db`, `${REPO}_c_db`])
})

test('olderThanDays keeps recent orphans, reaps stale ones', () => {
  const now = 1_000 * 24 * 60 * 60 * 1000 // day 1000 in epoch-ms
  const day = 24 * 60 * 60 * 1000
  const plan = planPrune(
    [
      { name: `${REPO}_stale_db`, createdAt: now - 10 * day },
      { name: `${REPO}_fresh_db`, createdAt: now - 1 * day },
    ],
    [],
    { repoSlug: REPO, olderThanDays: 7, now },
  )
  assert.deepStrictEqual(names(plan), [`${REPO}_stale_db`])
})

test('olderThanDays conservatively keeps unknown-age orphans', () => {
  const now = 1_000 * 24 * 60 * 60 * 1000
  const plan = planPrune([`${REPO}_nodate_db`], [], {
    repoSlug: REPO,
    olderThanDays: 7,
    now,
  })
  assert.deepStrictEqual(names(plan), [])
})

test('throws when repoSlug is missing', () => {
  assert.throws(() => planPrune([], [], {}), /repoSlug is required/)
})

test('throws when olderThanDays is set without now', () => {
  assert.throws(
    () => planPrune([`${REPO}_x_db`], [], { repoSlug: REPO, olderThanDays: 7 }),
    /requires opts\.now/,
  )
})
