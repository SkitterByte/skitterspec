'use strict'

/**
 * Provider-neutral spec↔tracker sync engine.
 *
 * Every function here is parameterised by a plain `config` object and an injected
 * `adapter` — it knows nothing about any specific tracker or provider. A
 * provider package supplies the config shape, the frontmatter key mapping, and the
 * adapter that talks to its API; this core does the three-way merge.
 */

const { normalizeLocal, normalizeRemote, readSnapshot } = require('./src/normalize.js')
const { classify, hashField, stableStringify } = require('./src/compare.js')
const { readBase, writeBase, backup } = require('./src/base.js')
const { pull } = require('./src/pull.js')
const { push } = require('./src/push.js')
const { writeFrontmatter } = require('./src/write.js')
const { frontmatterPatchFor, localWorkflowState } = require('./src/apply.js')

module.exports = {
  normalizeLocal,
  normalizeRemote,
  readSnapshot,
  classify,
  hashField,
  stableStringify,
  readBase,
  writeBase,
  backup,
  pull,
  push,
  writeFrontmatter,
  frontmatterPatchFor,
  localWorkflowState,
}
