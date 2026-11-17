'use strict'

/**
 * Jira holds no ideas yet, and its entry point must SAY so. `skitterspec idea`
 * reads a provider that registered nothing as cannot-tell and refuses every
 * capture; `{ supports: false }` is the positive answer that sends ideas to
 * specs/ideas.md instead.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

test('the jira entry point declares that it holds no ideas', () => {
  const bin = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skitterspec-jira.js'), 'utf8')
  assert.match(bin, /setProviderIdeaStore\(\{ supports: false \}\)/)
})
