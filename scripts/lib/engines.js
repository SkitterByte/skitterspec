'use strict'

/**
 * The repo's declared Node floor, and the version arithmetic around it.
 *
 * Two accusing checks read this floor — `workflows.test.js` (the ci.yml matrix
 * must test it) and `toolchain.test.js` (the `.nvmrc` pin must satisfy it) —
 * and two checks reading one fact two different ways is how they come to
 * disagree about it. Zero-dependency, like everything else in `scripts/`.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')

function readJson(f) {
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}

/** Every manifest's `engines.node`, as `[relative path, range]` pairs. */
function manifestEngines() {
  const out = [['package.json', readJson(path.join(ROOT, 'package.json'))]]
  const pkgs = path.join(ROOT, 'packages')
  for (const name of fs.readdirSync(pkgs).sort()) {
    const f = path.join(pkgs, name, 'package.json')
    if (fs.existsSync(f)) out.push([`packages/${name}/package.json`, readJson(f)])
  }
  return out.map(([rel, pkg]) => [rel, pkg.engines && pkg.engines.node])
}

/** "\>=22.13" → "22.13"; anything else → null rather than a guess. */
function floorOf(range) {
  const m = /^>=\s*(\d+(?:\.\d+)*)$/.exec(String(range || '').trim())
  return m ? m[1] : null
}

function cmpVersion(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

function lowest(versions) {
  return versions.slice().sort(cmpVersion)[0] ?? null
}

module.exports = { ROOT, manifestEngines, floorOf, cmpVersion, lowest }
