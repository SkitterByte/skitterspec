'use strict'

// Moving a project's conventions out of the old `spec-planning.md`
// (feat-rules-budget). Before that spec, the typecheck and test commands lived
// in a "Project conventions (fill this in)" section inside the managed rule.
// Filling it in made the whole 66k file "customized", so `update` kept it and
// the host went on loading all of it every session.
//
// `split` cuts that section out. `KNOWN` holds the hash of every shipped
// version with the section cut out, so a file whose ONLY edits were in that
// section hashes to a known value, and its edits can be carried over to
// `project-conventions.md` safely. Any other edit is cannot-tell, and the file
// is kept (`.claude/rules/negative-checks.md` rule 4).

const crypto = require('crypto')

const HEADING = /^## Project conventions \(fill this in\)[^\n]*\n/m

// `{ rest, body }`: `rest` is the file without the section, `body` the
// section's text below its heading. `null` when the section is not there.
function split(text) {
  const t = text.replace(/\r\n/g, '\n')
  const m = HEADING.exec(t)
  if (!m) return null
  const from = m.index
  const after = from + m[0].length
  const next = t.slice(after).search(/^## /m)
  const end = next === -1 ? t.length : after + next
  return { rest: t.slice(0, from) + t.slice(end), body: t.slice(after, end).trim() }
}

function strippedHash(text) {
  const parts = split(text)
  return parts && crypto.createHash('sha1').update(parts.rest).digest('hex')
}

let known = null
function KNOWN() {
  if (!known) known = new Set(require('./spec-planning-history.json').stripped)
  return known
}

module.exports = { split, strippedHash, KNOWN }
