'use strict'

/**
 * Jira holds no ideas yet, and its entry point must SAY so. `skitterspec idea`
 * reads a provider that registered nothing as cannot-tell and refuses every
 * capture; `{ supports: false }` is the positive answer that sends ideas to
 * specs/ideas.md instead.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { register } = require('../src/register.js')

test('the jira entry point declares that it holds no ideas', () => {
  const stores = []
  register({
    envConfig: { setProviderEnvDefaults() {}, setProviderConfigFile() {} },
    idea: { setProviderIdeaStore: (s) => stores.push(s) },
  })
  assert.deepStrictEqual(stores, [{ supports: false }])
})
