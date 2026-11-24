'use strict'

/**
 * Parked distributions: kept in the repo, but not built, released or tested.
 *
 * `parked.json` is the one switch. Every script that lists distributions keeps
 * its FULL list and filters it through `active()`, so un-parking is deleting a
 * name here — plus re-adding that package's tag trigger and dispatch option in
 * `.github/workflows/release.yml`, which cannot read this file (RELEASING.md,
 * "Un-parking"). Spec: chore-park-linear-jira.
 */

const PARKED = require('./parked.json')

function isParkedDist(name, parked = PARKED) {
  return parked.dists.includes(name)
}

/** True for a repo-relative path inside a parked source package. */
function isParkedSource(relPath, parked = PARKED) {
  const p = String(relPath).split('\\').join('/')
  return parked.sources.some((src) => p === src || p.startsWith(src + '/'))
}

/** `list` without the parked distributions, order kept. */
function active(list, parked = PARKED) {
  return list.filter((name) => !isParkedDist(name, parked))
}

/** `obj` without the parked distributions' keys, order kept. */
function activeEntries(obj, parked = PARKED) {
  return Object.fromEntries(Object.entries(obj).filter(([name]) => !isParkedDist(name, parked)))
}

function parkedMessage(name) {
  return `"${name}" is parked — not built, released or tested (see scripts/parked.json and RELEASING.md, "Un-parking")`
}

module.exports = { PARKED, isParkedDist, isParkedSource, active, activeEntries, parkedMessage }
