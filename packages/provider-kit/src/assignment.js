'use strict'

/**
 * Assignment — who is building a spec, mirrored to the tracker's assignee.
 *
 * Three commands every provider with assignment shares, hoisted from the
 * Linear provider when GitHub became the second consumer:
 *
 *   - `assign <spec> --to <id> [--name <n>] | --release` stamps (or clears) the
 *     assignee fields in the overview frontmatter. It writes the REPO and
 *     nothing else; the next push carries it, like any other field.
 *   - `whoami [--set <id> [--name <n>]] [--unset]` reports — and caches — who
 *     the operator is in the tracker, which is the fact assignment rests on.
 *   - `users [<query>]` finds a person to hand a spec to.
 *
 * Everything tracker-shaped arrives as a hook (`makeAssignmentCommands`): the
 * tracker's name for messages, the frontmatter fields, the store scope, how a
 * credential resolves and how an adapter is made. The behaviour is the Linear
 * provider's, unchanged — its tests still pin every message.
 */

const path = require('node:path')

const { ownsField, writeFrontmatter, deleteFrontmatter, fieldsOf } = require('@skitterbyte/skitterspec-sync-core')
const { resolveTransport } = require('./transport.js')
const { makeSpecHelpers } = require('./specs.js')

/**
 * @param {object} p
 *   - `tracker`         the tracker's name in messages ("Linear", "GitHub")
 *   - `configFile`      the provider config path, for refusals
 *   - `bin`             the command a person types (for the hints)
 *   - `idHint`          how a user id is described ("<linear-user-id>", "<login>")
 *   - `scopeOf(config)` → `{ id, label }` the credentials-store scope, or `{ id: '' , missing }` with
 *                         `missing` the refusal text when the config cannot name one
 *   - `storePath(env)`, `writeUser(file, scope, user)`, `removeUser(file, scope)`
 *   - `resolveIdentity(config, env, deps)` the provider's identity binding
 *   - `resolveCredential(config, env)` → `{ ok, error? }`
 *   - `makeAdapter(config, credential, flags)` → an adapter with `searchUsers`
 *   - `displayNameOf(user)`
 *   - `validateAssignee(config, id, flags)` OPTIONAL — async, resolves to a
 *     refusal string or null. Absent means "do not check", which is the Linear
 *     provider's behaviour.
 *   - `usersOverMcp` the hint printed when users must be searched over MCP
 *   - `unknownHint` OPTIONAL extra lines for the unknown-identity whoami report
 */
function makeAssignmentCommands(p) {
  const helpers = makeSpecHelpers({ program: 'spec-sync' })

  async function assign(dir, config, specArg, flags, out) {
    const snapshotDir = helpers.resolveOrExit(specArg, dir, out)
    if (!snapshotDir) return 1
    const fields = fieldsOf(config)

    const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
    const identifier = helpers.linkedIdentifier(path.join(snapshotDir, overviewFile), config)
    const rel = path.relative(dir, snapshotDir)

    const problems = []
    if (flags.release && flags.to) problems.push('--release and --to are opposites — pass one')
    if (!flags.release && !flags.to) problems.push('nothing to do — pass --to <user-id> or --release')
    // An unlinked spec has no issue to assign. Refusing beats stamping a field
    // that would sit in the file doing nothing until someone noticed.
    if (!identifier) problems.push(`${rel} is not linked to ${p.tracker} — /spec-push it first`)
    // AND THE SAME REASONING FOR THE FIELD ITSELF. A field the repo does not own
    // is dropped from the projection, so a stamp written here would never reach
    // the tracker — while the success line says `next: push it`. That is not a
    // silent skip, it is an untrue assertion. Applies to `--release` too.
    if (!ownsField(config, 'assignee')) {
      problems.push(
        'this repo does not own the assignee field — set sync.fieldOwnership.assignee ' +
          `to "push" in ${p.configFile}`,
      )
    }
    // A POSITIVE refusal only: the hook answers "this id cannot be assigned"
    // or null, and every cannot-tell inside it must be null.
    if (!problems.length && flags.to && p.validateAssignee) {
      const refusal = await p.validateAssignee(config, flags.to, flags)
      if (refusal) problems.push(refusal)
    }

    if (problems.length) {
      out.write(
        ['spec-sync assign: refusing to write — nothing was changed', ...problems.map((x) => `  ${x}`)].join('\n') + '\n',
      )
      return 1
    }

    if (flags.release) {
      const removed = deleteFrontmatter(snapshotDir, config, [fields.assigneeId, fields.assigneeName].filter(Boolean))
      if (flags.json) {
        out.write(JSON.stringify({ spec: rel, issue: identifier, released: removed.length > 0 }, null, 2) + '\n')
        return 0
      }
      out.write(
        (removed.length
          ? `spec-sync assign: ${rel} released (${identifier})\n`
          : `spec-sync assign: ${rel} records no assignee — nothing to release\n`) +
          `  next: push it, so ${p.tracker} is unassigned too\n`,
      )
      return 0
    }

    writeFrontmatter(snapshotDir, config, {
      [fields.assigneeId]: flags.to,
      // Display only — the projection never sends it. It exists so a reader (and
      // `/spec-claim`) can name the person without a tracker round trip.
      ...(fields.assigneeName ? { [fields.assigneeName]: flags.name || null } : {}),
    })
    if (flags.json) {
      out.write(JSON.stringify({ spec: rel, issue: identifier, id: flags.to, name: flags.name || null }, null, 2) + '\n')
      return 0
    }
    const who = flags.name ? `${flags.name} (${flags.to})` : flags.to
    out.write(`spec-sync assign: ${rel} assigned to ${who} (${identifier})\n  next: push it, so ${p.tracker} agrees\n`)
    return 0
  }

  /**
   * Exit 0 even when the answer is "unknown": this answers a question, and
   * "nobody is identified here" is a valid answer — a shared key, an offline
   * machine. A successful DERIVE is cached; a cache read is not re-written, and
   * the caching lives here so that asking never has a side effect.
   */
  async function whoami(dir, config, flags, out) {
    const env = flags.env || process.env
    const file = p.storePath(env)
    const scope = p.scopeOf(config)

    // The store is keyed by scope, so without one there is nowhere to read from
    // or write to. That IS a broken config, so it exits non-zero.
    if (!scope.id) {
      out.write(scope.missing + '\n')
      return 1
    }
    const label = scope.label || scope.id

    if (flags.unset) {
      const r = p.removeUser(file, scope.id, {})
      if (!r.ok) {
        out.write(`spec-sync whoami: ${r.reason}\n`)
        return 1
      }
      out.write(
        r.removed
          ? `spec-sync whoami: forgot the identity for ${label} (the ${p.credentialNoun || 'API key'} is untouched)\n`
          : `spec-sync whoami: no identity stored for ${label} — nothing to forget\n`,
      )
      return 0
    }

    if (flags.set) {
      const r = p.writeUser(file, scope.id, { id: flags.set, name: flags.name }, {})
      if (!r.ok) {
        out.write(`spec-sync whoami: ${r.reason}\n`)
        return 1
      }
      if (flags.json) {
        out.write(JSON.stringify({ id: flags.set, name: flags.name || null, source: 'set', store: r.path }, null, 2) + '\n')
        return 0
      }
      const shown = flags.name ? `${flags.name} (${flags.set})` : flags.set
      out.write(`spec-sync whoami: identity for ${label} set to ${shown} in ${r.path} (600)\n`)
      return 0
    }

    const identity = await p.resolveIdentity(config, env, { adapter: flags.adapter, fetch: flags.fetch })

    if (identity.ok && identity.source === 'viewer') {
      // A failed write is not fatal: we HAVE the answer, and re-deriving it next
      // time is a slower success, not a wrong one.
      const cached = p.writeUser(file, scope.id, { id: identity.id, name: identity.name }, {})
      if (!cached.ok) identity.cacheWarning = cached.reason
    }

    if (flags.json) {
      out.write(
        JSON.stringify(
          {
            [p.scopeJsonKey || 'team']: label,
            store: file,
            ok: identity.ok,
            id: identity.id || null,
            name: identity.name || null,
            source: identity.source,
            reason: identity.ok ? null : identity.reason || null,
          },
          null,
          2,
        ) + '\n',
      )
      return 0
    }

    if (!identity.ok) {
      out.write(
        [
          'spec-sync whoami: unknown — no identity for this workspace',
          `  ${identity.reason}`,
          '  Set one by hand:',
          `    ${p.bin} spec-sync whoami --set ${p.idHint} --name "<your name>"`,
          `  Find the id with: ${p.bin} spec-sync users <name-or-email>`,
        ].join('\n') + '\n',
      )
      return 0
    }

    const where = identity.source === 'store' ? `cached in ${file}` : `derived from the ${p.credentialNoun || 'API key'}`
    const lines = [
      `spec-sync whoami: ${identity.name || '(unnamed)'} <${identity.id}>`,
      `  ${(p.scopeLineLabel || 'team:').padEnd(7)} ${label}`,
      `  source: ${where}`,
    ]
    if (identity.cacheWarning) lines.push(`  note:   not cached — ${identity.cacheWarning}`)
    out.write(lines.join('\n') + '\n')
    return 0
  }

  /**
   * The engine answers on the API path and steps aside on the MCP path — the
   * same contract `states` follows.
   */
  async function users(dir, config, query, flags, out) {
    const cred = p.resolveCredential(config, flags.env || process.env)
    const transport = resolveTransport(flags, config, cred.ok || !!flags.adapter)

    if (transport === 'mcp') {
      if (flags.json) {
        out.write(JSON.stringify({ transport: 'mcp', reason: cred.ok ? 'requested' : cred.error, users: null }, null, 2) + '\n')
        return 0
      }
      out.write(
        ['spec-sync users: transport = mcp', `  ${cred.ok ? '--via mcp was requested' : cred.error}`, `  ${p.usersOverMcp}`].join('\n') +
          '\n',
      )
      return 0
    }
    if (!cred.ok && !flags.adapter) {
      out.write(`spec-sync users: refusing — ${cred.error}\n`)
      return 1
    }

    const adapter = flags.adapter || p.makeAdapter(config, cred, flags)
    let page
    try {
      page = await adapter.searchUsers(query || '', { limit: flags.limit || 50, cursor: flags.cursor || null })
    } catch (error) {
      out.write(`spec-sync users: ${error.message}\n`)
      return 1
    }

    const list = (page && page.users) || []
    if (flags.json) {
      out.write(JSON.stringify({ transport: 'api', users: list, nextCursor: (page && page.nextCursor) || null }, null, 2) + '\n')
      return 0
    }
    if (!list.length) {
      out.write(`spec-sync users: no match for ${JSON.stringify(query || '')}\n`)
      return 0
    }
    const lines = [`spec-sync users: ${list.length} match(es)`]
    for (const u of list) {
      // A deactivated user still resolves by id and can still be assigned, so
      // the marker is the difference between a valid pick and a silently dead one.
      const inactive = u && u.active === false ? '  [deactivated]' : ''
      const email = u && u.email ? `  ${u.email}` : ''
      lines.push(`  ${p.displayNameOf(u) || '(unnamed)'} <${u && u.id}>${email}${inactive}`)
    }
    if (page && page.nextCursor) lines.push(`  … more — re-run with --cursor ${page.nextCursor}`)
    out.write(lines.join('\n') + '\n')
    return 0
  }

  return { assign, whoami, users }
}

module.exports = { makeAssignmentCommands }
