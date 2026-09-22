'use strict'

/**
 * Detect a spec whose mirror was created under the **pre-9.0 model**.
 *
 * v9 remapped the mirror: a spec is an issue (was a Project), a phase is a
 * sub-issue (was a Milestone), and tasks are no longer objects at all. The
 * frontmatter keys moved with it (in the Linear provider's vocabulary,
 * `linear_project_id` -> `linear_identifier`, `linear_milestone_id` ->
 * `linear_issue_id` — see `config.fields`).
 *
 * The failure this guards is silent and destructive: v9 looks for the new keys,
 * finds nothing, and produces a perfectly ordinary **all-creates** plan. Applying
 * it mints a fresh mirror and abandons the old one — in the field that would have
 * been 17 new objects against 2 projects, 15 milestones and 145 task issues left
 * orphaned, with nothing on screen suggesting a prior mirror existed. It was
 * caught only because an all-creates plan looked wrong for specs synced an hour
 * earlier.
 *
 * Pure reads; returns `null` for anything that is not demonstrably pre-9.0, so a
 * never-pushed spec is never mistaken for a stranded one.
 */

const fs = require('node:fs')
const path = require('node:path')

const { parseFrontmatter } = require('./normalize.js')
const { readBase } = require('./base.js')
const { listPhaseFiles } = require('./write.js')

// The pre-9.0 keys come from the provider's field vocabulary
// (`config.fields.legacyIdentifier` / `.legacyIssueId`). A provider with no
// pre-9.0 era omits them, and detection then reports nothing: there is no old
// model its repos could be stranded on, so an absence is not evidence.

function frontmatterOf(file) {
  try {
    return parseFrontmatter(fs.readFileSync(file, 'utf-8')).data || {}
  } catch {
    return {}
  }
}

// A pre-9.0 snapshot recorded `{project, milestones, issues}`; v9 records
// `{issue, subIssues}`. Counting what it holds turns the warning from "this
// looks old" into "this many live objects would be abandoned".
function countOrphans(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const size = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0)
  const projects = snapshot.project ? 1 : 0
  const milestones = size(snapshot.milestones)
  const issues = size(snapshot.issues)
  if (!projects && !milestones && !issues) return null
  return { projects, milestones, issues, total: projects + milestones + issues }
}

/**
 * @returns {null|{keys:string[], files:string[], orphans:object|null, orphanCount:number}}
 */
function detectLegacyMirror({ dir, snapshotDir, identifier, config }) {
  const fields = (config && config.fields) || {}
  const legacyOverviewKey = fields.legacyIdentifier
  const legacyPhaseKey = fields.legacyIssueId
  // No legacy vocabulary declared -> this provider has no pre-9.0 era, so there
  // is no old model its repos could be stranded on, and an absence of the keys
  // proves nothing (`.claude/rules/negative-checks.md`).
  if (!legacyOverviewKey && !legacyPhaseKey) return null

  const keys = []
  const files = []

  const overviewFile = (config && config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const overview = frontmatterOf(path.join(snapshotDir, overviewFile))
  if (legacyOverviewKey && overview[legacyOverviewKey] != null) {
    keys.push(legacyOverviewKey)
    files.push(overviewFile)
  }

  for (const file of listPhaseFiles(snapshotDir)) {
    if (legacyPhaseKey && frontmatterOf(path.join(snapshotDir, file))[legacyPhaseKey] != null) {
      if (!keys.includes(legacyPhaseKey)) keys.push(legacyPhaseKey)
      files.push(file)
    }
  }

  let orphans = null
  try {
    orphans = countOrphans(readBase(dir, identifier, config))
  } catch {
    /* an unreadable snapshot is not evidence either way */
  }

  // A legacy snapshot alone is enough: the spec may have had its frontmatter
  // hand-cleaned while the mirror it names is still live.
  if (!keys.length && !orphans) return null

  return { keys, files, orphans, orphanCount: orphans ? orphans.total : 0 }
}

module.exports = { detectLegacyMirror }
