'use strict'

/**
 * Neutral default config for engine tests.
 *
 * The sync engine consumes config as plain data — it has no loader and no
 * tracker-specific knowledge. A provider adapter package owns
 * the real loader and defaults; here we hand the engine an equivalent neutral
 * shape so the core is exercised without any provider coupling.
 */
function neutralConfig() {
  return {
    // `tasks: 'none'` is pinned deliberately, and diverges from the provider's
    // shipped default ('checklist'): most tests here exercise goal EXTRACTION —
    // wrapped continuations, keying, push idempotency — and a checklist appended
    // to every goal would obscure what they assert. The shipped default is
    // covered where it belongs: sync-task-checklist.test.js for the projection,
    // and the linear package's config + engine-integration tests end to end.
    mapping: { specFolder: 'issue', phases: 'subissue', tasks: 'none' },
    states: {
      backlog: 'Backlog',
      'in-progress': 'In Progress',
      complete: 'Done',
      cancelled: 'Cancelled',
    },
    snapshot: { overviewFile: '00-overview.md' },
    branch: { pattern: '{type}/{slug}' },
    sync: {
      baseDir: 'specs/.core/sync-base',
      backupDir: 'specs/.core/sync-backups',
      fieldOwnership: {
        description: 'both',
        subIssues: 'both',
        workflowState: 'pull',
      },
      localOnlySections: ['State log', 'Changelog', 'Open questions'],
    },
  }
}

module.exports = { neutralConfig }
