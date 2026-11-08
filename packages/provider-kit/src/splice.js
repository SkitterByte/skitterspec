'use strict'

/**
 * `spec-sync splice <spec> --live <file> [--phase <ref>]` — the body to write,
 * for an apply the ENGINE is not doing (the skills' MCP path).
 *
 * Under `mapping.description: "summary"` a plan carries the block alone, and
 * writing that over the whole description would delete the team's text around
 * it. So the skill reads the live body, hands it here, and writes back exactly
 * what this prints — the splice is the engine's, never composed in a skill.
 * In `spec` mode it prints the projection as it is: the whole body is the
 * repo's there.
 *
 * Exit codes: 0 with the body on stdout; 1 when nothing must be written — a
 * damaged block (a delimiter someone edited), an unknown phase ref, or a live
 * file that could not be read. Nothing is printed to stdout then, so a caller
 * that pipes stdout into a write can never write a partial or empty body.
 */

const fs = require('node:fs')

const { projectionOf, descriptionMode, spliceBlock } = require('@skitterbyte/skitterspec-sync-core')

function spliceBody(snapshotDir, config, live, phaseRef) {
  const projection = projectionOf(snapshotDir, config)
  let planned = projection.description
  if (phaseRef) {
    const want = String(phaseRef).replace(/\.md$/, '')
    const sub = (projection.subIssues || []).find((s) => s.ref === want)
    if (!sub) return { ok: false, reason: `no phase ${want} in the projection` }
    planned = sub.goal
  }
  if (planned == null) return { ok: false, reason: 'the projection has no body for that object' }
  if (descriptionMode(config) !== 'summary') return { ok: true, text: planned }
  const text = spliceBlock(live, planned, config)
  if (text == null) {
    return { ok: false, reason: "its summary block's delimiters were edited — write nothing; repair them and re-run" }
  }
  return { ok: true, text }
}

function specSyncSplice({ snapshotDir, config, flags, out, err, program = 'spec-sync' }) {
  const say = (msg) => (err || out).write(`${program} splice: ${msg}\n`)
  if (!flags.live) {
    say('pass --live <file> holding the description the tracker has now (an empty file for a new issue)')
    return 1
  }
  let live
  try {
    live = fs.readFileSync(flags.live, 'utf-8')
  } catch (error) {
    say(`cannot read --live: ${error.message}`)
    return 1
  }
  const r = spliceBody(snapshotDir, config, live, flags.phase)
  if (!r.ok) {
    say(r.reason)
    return 1
  }
  out.write(r.text)
  return 0
}

module.exports = { spliceBody, specSyncSplice }
