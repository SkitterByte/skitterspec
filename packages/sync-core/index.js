'use strict'

/**
 * Provider-neutral one-way sync engine (repo → tracker).
 *
 * Every function is parameterised by a plain `config` object — it knows nothing
 * about any specific tracker. The repo is the source of truth: the engine builds
 * a local projection, diffs it against a committed last-pushed snapshot
 * (`planChanges`), and returns a create/update plan the provider skill applies
 * over its API. No remote content is read for CONTENT: nothing the tracker holds
 * ever feeds the projection, the snapshot, or a repo file. `compareStored` is the
 * one function that looks at a tracker value, and it only checks that what was
 * stored matches what was sent — it merges nothing (see `src/verify.js`).
 */

const { normalizeLocal, lintPhases, readSnapshot, parseFrontmatter, remoteWorkflowState, titleFromText, validateStates, stateSuggestions } = require('./src/normalize.js')
const { planChanges, snapshotOf, isEmptyPlan, hashField, stableStringify } = require('./src/compare.js')
const { readBase, writeBase } = require('./src/base.js')
const { push, recordPush, projectionOf } = require('./src/push.js')
const { writeFrontmatter, stampSubIssueId, stampIssueId, findPhaseFileByTitle, listPhaseFiles } = require('./src/write.js')
const { sanitizeSpecMarkdown } = require('./src/sanitise.js')
const { detectLegacyMirror } = require('./src/legacy.js')
const { compareStored } = require('./src/verify.js')
const { flattenNestedTables } = require('./src/tables.js')
const { planRetarget, applyRetarget, deriveRecordedKey, isEmptyRetarget, dirtyPaths } = require('./src/retarget.js')

module.exports = {
  normalizeLocal,
  lintPhases,
  readSnapshot,
  parseFrontmatter,
  projectionOf,
  planChanges,
  snapshotOf,
  isEmptyPlan,
  push,
  recordPush,
  remoteWorkflowState,
  titleFromText,
  validateStates,
  stateSuggestions,
  hashField,
  stableStringify,
  readBase,
  writeBase,
  writeFrontmatter,
  stampSubIssueId,
  stampIssueId,
  findPhaseFileByTitle,
  listPhaseFiles,
  sanitizeSpecMarkdown,
  detectLegacyMirror,
  compareStored,
  flattenNestedTables,
  planRetarget,
  applyRetarget,
  deriveRecordedKey,
  isEmptyRetarget,
  dirtyPaths,
}
