'use strict'

/**
 * A table-driven flag parser for a provider CLI, carrying the one discipline
 * the first provider learned the hard way: an UNKNOWN `--flag` is a refusal,
 * never a silent positional. (A renamed flag once parsed as a no-op — the
 * repair invocation ran the wrong command, ignored the flag, and exited 0.)
 *
 * The table maps `--flag` → spec:
 *   - `{ kind: 'boolean' }`            sets `flags[name] = true`
 *   - `{ kind: 'value' }`              takes the next token verbatim
 *   - `{ kind: 'string' }`             takes the next token, trimmed ('' kept)
 *   - `{ kind: 'number' }`             Number(next token)
 *   - `{ kind: 'path' }`               path.resolve(next token)
 *   - `{ kind: 'list' }`               repeatable; pushes trimmed tokens
 *   - `{ kind: 'custom', take, handle }` `handle(flags, value, context)`;
 *                                      `take: false` consumes no token
 *   - any spec may set `name` (defaults to the camelCased flag)
 *
 * A spec name never starts with `--`, so the refusal cannot swallow a real
 * argument. `renamed` maps an old flag to advice lines appended to the refusal,
 * so a rename hands off instead of leaving the caller to guess.
 */

const path = require('node:path')

const camel = (flag) => flag.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())

function parseFlags(args, table, { defaults = {}, renamed = {}, context = {} } = {}) {
  const flags = { ...defaults }
  const positional = []
  const unknown = []
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    const spec = table[token]
    if (!spec) {
      if (String(token).startsWith('--')) unknown.push(token)
      else positional.push(token)
      continue
    }
    const name = spec.name || camel(token)
    const kind = spec.kind || 'boolean'
    if (kind === 'boolean') flags[name] = true
    else if (kind === 'value') flags[name] = args[++i]
    else if (kind === 'string') flags[name] = String(args[++i] || '').trim()
    else if (kind === 'number') flags[name] = Number(args[++i])
    else if (kind === 'path') flags[name] = path.resolve(args[++i])
    else if (kind === 'list') (flags[name] = flags[name] || []).push(String(args[++i] || '').trim())
    else if (kind === 'custom') {
      const value = spec.take === false ? undefined : args[++i]
      spec.handle(flags, value, context)
    } else throw new Error(`parseFlags: unknown kind "${kind}" for ${token}`)
  }
  return { flags, positional, unknown }
}

// The refusal, phrased once. Returns the lines to print (the caller owns the
// stream and the exit code).
function unknownFlagLines(program, unknown, renamed = {}) {
  const lines = [`${program}: unknown flag ${unknown.join(', ')}`]
  for (const flag of unknown) {
    if (renamed[flag]) for (const advice of [].concat(renamed[flag])) lines.push(`  ${advice}`)
  }
  lines.push(`  run \`${program}\` for the full usage.`)
  return lines
}

module.exports = { parseFlags, unknownFlagLines }
