'use strict'

/**
 * `spec-sync list --mine | --by <user>` — whose tickets to list.
 *
 * Linear defined the contract (`linear/src/cli-sync.js`, decision 9 of
 * `feat-linear-assignment`); this is the same contract for every provider that
 * lists over the API, so the two sentences below mean the same thing anywhere:
 *
 *   - `--mine` with an UNKNOWN identity lists nothing and exits 0. Identity is
 *     an ordinary unknown (a bot token, an offline machine). What must never
 *     happen is dropping the filter and printing everyone's work under a
 *     heading that promised yours.
 *   - `--by` that matches nobody, or more than one person, exits 1. The
 *     argument is wrong and only the caller can fix it — the same shape as an
 *     unknown `--state` — and a fallback to everyone would be the same lie.
 *
 * Returns `{ assignee: { id, name } | null }` to carry on with, or
 * `{ code, lines }` to print and stop.
 */
async function resolveListAssignee({ flags, config, env, adapter, resolveIdentity, displayNameOf, tracker, prog }) {
  if (flags.mine && flags.by) {
    return {
      code: 1,
      lines: [
        `${prog} list: --mine and --by both filter by assignee, so they cannot be combined`,
        '  use --mine for your own, or --by <user> for someone else.',
      ],
    }
  }
  if (flags.mine) {
    const who = await resolveIdentity(config, env, { adapter })
    if (!who || !who.ok) {
      return {
        code: 0,
        lines: [
          `${prog} list: --mine needs to know who you are, and it does not (${(who && who.reason) || 'no identity'})`,
          '  run `spec-sync whoami --set <id>` to say so, or use --by <user>.',
        ],
      }
    }
    return { assignee: { id: who.id, name: who.name || who.id } }
  }
  if (flags.by) {
    const term = String(flags.by)
    let found
    try {
      found = await adapter.searchUsers(term, { limit: 50 })
    } catch (error) {
      return { code: 1, lines: [`${prog} list: could not search users (${error.message})`] }
    }
    const users = (found && found.users) || []
    if (!users.length) {
      return {
        code: 1,
        lines: [`${prog} list: no ${tracker} user matches ${JSON.stringify(term)}`, '  `spec-sync users <term>` lists who there is.'],
      }
    }
    if (users.length > 1) {
      const lines = [`${prog} list: ${users.length} users match ${JSON.stringify(term)}`]
      for (const u of users.slice(0, 10)) lines.push(`  ${displayNameOf(u) || '(unnamed)'}${u.email ? `  ${u.email}` : ''}`)
      if (users.length > 10) lines.push(`  … and ${users.length - 10} more`)
      lines.push('  narrow it — an email address matches exactly one person.')
      return { code: 1, lines }
    }
    return { assignee: { id: users[0].id, name: displayNameOf(users[0]) || users[0].id } }
  }
  return { assignee: null }
}

module.exports = { resolveListAssignee }
