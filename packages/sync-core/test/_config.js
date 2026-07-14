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
    mapping: { specFolder: 'project', phases: 'milestone', tasks: 'issue' },
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
        milestones: 'both',
        phaseBodies: 'both',
        acceptanceCriteria: 'both',
        taskBreakdown: 'both',
        workflowState: 'pull',
        priority: 'pull',
        labels: 'pull',
      },
      localOnlySections: ['State log', 'Changelog', 'Open questions'],
    },
  }
}

module.exports = { neutralConfig }
