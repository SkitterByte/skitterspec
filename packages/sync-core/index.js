'use strict'

/**
 * Provider-neutral one-way sync engine (repo → tracker).
 *
 * Every function is parameterised by a plain `config` object — it knows nothing
 * about any specific tracker. The repo is the source of truth: the engine builds
 * a local projection, diffs it against a committed last-pushed snapshot
 * (`planChanges`), and returns a create/update plan the provider skill applies
 * over its API. No remote content is read or merged.
 */

const { normalizeLocal, readSnapshot, remoteWorkflowState, titleFromText, validateStates } = require('./src/normalize.js')
const { planChanges, snapshotOf, isEmptyPlan, hashField, stableStringify } = require('./src/compare.js')
const { readBase, writeBase } = require('./src/base.js')
const { push, recordPush, projectionOf } = require('./src/push.js')
const { writeFrontmatter, stampMilestoneId, stampIssueId, findPhaseFileByTitle } = require('./src/write.js')
const { sanitizeSpecMarkdown } = require('./src/sanitise.js')

module.exports = {
  normalizeLocal,
  readSnapshot,
  projectionOf,
  planChanges,
  snapshotOf,
  isEmptyPlan,
  push,
  recordPush,
  remoteWorkflowState,
  titleFromText,
  validateStates,
  hashField,
  stableStringify,
  readBase,
  writeBase,
  writeFrontmatter,
  stampMilestoneId,
  stampIssueId,
  findPhaseFileByTitle,
  sanitizeSpecMarkdown,
}
