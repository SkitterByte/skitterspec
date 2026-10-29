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

const { ownsField, normalizeLocal, LIFECYCLE_BUCKETS, lintPhases, readSnapshot, parseFrontmatter, remoteWorkflowState, remoteStateReading, stateNamesFor, titleFromText, validateStates, stateSuggestions, stageForState, remoteStage, phaseModeFor, LADDER_ORIGIN_BUCKET } = require('./src/normalize.js')
const { planChanges, snapshotOf, isEmptyPlan, hashField, stableStringify, remoteDescriptionEdited, remoteSubIssueEdited } = require('./src/compare.js')
const { readBase, writeBase } = require('./src/base.js')
const { push, recordPush, projectionOf } = require('./src/push.js')
const { writeFrontmatter, deleteFrontmatter, stampSubIssueId, stampIssueId, findPhaseFileByTitle, listPhaseFiles } = require('./src/write.js')
const { detectLegacyMirror } = require('./src/legacy.js')
const { compareStored, stream } = require('./src/verify.js')
const { identityDialect, dialectOf } = require('./src/dialect.js')
const { fieldsOf } = require('./src/fields.js')
const { renderTaskBlock, findTaskBlocks, wrapEmphasisAware, collapseHyphenAware, inferWidth, fenceMask, DEFAULT_WIDTH } = require('./src/task-block.js')
const { planRetarget, applyRetarget, deriveRecordedKey, isEmptyRetarget, dirtyPaths } = require('./src/retarget.js')

module.exports = {
  ownsField,
  normalizeLocal,
  // Exported for `spec-sync list`: an `inline`-mode spec has no phase sub-issues
  // to read, so the listing must resolve the mode rather than assume `subissue`.
  phaseModeFor,
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
  remoteStateReading,
  stateNamesFor,
  titleFromText,
  validateStates,
  stateSuggestions,
  stageForState,
  remoteStage,
  LADDER_ORIGIN_BUCKET,
  hashField,
  stableStringify,
  readBase,
  writeBase,
  writeFrontmatter,
  deleteFrontmatter,
  stampSubIssueId,
  stampIssueId,
  findPhaseFileByTitle,
  listPhaseFiles,
  detectLegacyMirror,
  compareStored,
  // The tolerant reduction behind both `compareStored` and the snapshot's
  // `descriptionStream` hash — exported so a provider can reduce a read-back the
  // same way rather than writing a second one that disagrees.
  stream,
  // Did someone else edit the tracker's description since the last push?
  // Three-valued; `null` is cannot-tell and must never be reported as drift.
  remoteDescriptionEdited,
  remoteSubIssueEdited,
  // Provider seams: the frontmatter field vocabulary and the markdown dialect
  // a provider's config supplies (`config.fields` / `config.dialect`).
  fieldsOf,
  identityDialect,
  dialectOf,
  // The lifecycle buckets, exported once so providers and tests stop growing
  // private copies (the tracker-free common package keeps its own — it cannot
  // depend on this package).
  LIFECYCLE_BUCKETS,
  // Task-block helpers a provider's own text tooling builds on (the Linear
  // sanitiser reflows emphasis-aware with these).
  renderTaskBlock,
  findTaskBlocks,
  wrapEmphasisAware,
  collapseHyphenAware,
  inferWidth,
  fenceMask,
  DEFAULT_WIDTH,
  planRetarget,
  applyRetarget,
  deriveRecordedKey,
  isEmptyRetarget,
  dirtyPaths,
}
