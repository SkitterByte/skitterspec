'use strict'

/**
 * Epic members in a tracker listing (spec feat-epics). A listing keeps only
 * top-level issues because a sub-issue is normally a phase — but an epic's
 * member is a spec that is ALSO a sub-issue, of its epic's issue. These keep
 * such a member and group it under its epic, on a positive signal only: its
 * parent is linked to an `epic-` spec in this checkout.
 *
 * BLIND SPOT: an epic this checkout has no linked copy of reads as an unknown
 * parent, so its members stay filtered out exactly as they were before epics
 * existed — a missing row, never a phase shown as a spec.
 */

/** The identifiers of the `epic-` specs in a `listSpecs`-shaped array. */
function epicIdentifiers(specs) {
  return new Set((specs || []).filter((s) => s && s.identifier && /^epic-/.test(s.spec)).map((s) => s.identifier))
}

/**
 * The epic an issue is a member of, or null. `parentOf(issue)` gives the
 * parent's identifier in the provider's own spelling.
 */
function epicOf(issue, epics, parentOf) {
  const parent = issue && issue.parent ? parentOf(issue) : null
  return parent && epics.has(parent) ? parent : null
}

/** Top-level issues, plus the members of a linked epic. */
function keepSpecIssues(issues, epics, parentOf) {
  return (issues || []).filter((i) => !i.parent || epicOf(i, epics, parentOf))
}

/**
 * Rows reordered so each member follows its epic's row. A member whose epic's
 * row is not in the listing keeps its place. Rows carry `epic` when a member.
 */
function groupUnderEpics(rows) {
  const listed = new Set(rows.map((r) => r.identifier))
  const under = (id) => rows.filter((r) => r.epic === id)
  return rows.filter((r) => !r.epic || !listed.has(r.epic)).flatMap((r) => [r, ...under(r.identifier)])
}

module.exports = { epicIdentifiers, epicOf, keepSpecIssues, groupUnderEpics }
