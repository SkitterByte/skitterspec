'use strict'

// Cancelling a spec abandons its unfinished phases. Projected as their emoji
// alone they stayed open in Backlog under a closed parent — found on the GitHub
// provider's live smoke, and true of every provider.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

function specIn(bucket) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cancel-'))
  const dir = path.join(root, 'specs', bucket, 'feat-x')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# X\n\n## Problem\n\nP.\n')
  fs.writeFileSync(path.join(dir, '01-done.md'), '# Phase 1 — Done ✅\n\n**Goal:** shipped.\n')
  fs.writeFileSync(path.join(dir, '02-doing.md'), '# Phase 2 — Doing 🔄\n\n**Goal:** half.\n')
  fs.writeFileSync(path.join(dir, '03-todo.md'), '# Phase 3 — Todo ⬜\n\n**Goal:** never.\n')
  return dir
}

const states = (dir) => normalizeLocal(dir, neutralConfig()).subIssues.map((s) => [s.ref, s.state])

test('a cancelled spec cancels its unfinished phases and keeps the finished one complete', () => {
  assert.deepStrictEqual(states(specIn('cancelled')), [
    ['01-done', 'complete'],
    ['02-doing', 'cancelled'],
    ['03-todo', 'cancelled'],
  ])
})

test('every other bucket leaves phase states to their emoji', () => {
  for (const bucket of ['backlog', 'in-progress', 'complete']) {
    assert.deepStrictEqual(
      states(specIn(bucket)),
      [
        ['01-done', 'complete'],
        ['02-doing', 'in-progress'],
        ['03-todo', 'backlog'],
      ],
      bucket,
    )
  }
})
