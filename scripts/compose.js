'use strict'

/**
 * Build-time skill composition for the pick-one distributions.
 *
 * `common` holds one canonical copy of every shared skill/rule, with explicit
 * insertion points written as `<!-- seam:NAME -->`. Each published distribution
 * is built by copying `common`'s assets and filling those seams from the selected
 * provider's fragments — the base distribution fills them with nothing (the seam
 * vanishes), a provider distribution fills them with its fragment body.
 *
 * Deliberately dumb: a fixed-marker string substitution, zero dependencies, and
 * idempotent (composing already-composed output is a no-op, since a filled seam
 * leaves no marker behind). No template engine — the marker set IS the contract
 * between `common` and any provider, so it must stay trivially auditable.
 */

const fs = require('node:fs')
const path = require('node:path')

// A seam marker: `<!-- seam:some-name -->`. Names are kebab-case.
const SEAM_RE = /<!--\s*seam:([a-z0-9-]+)\s*-->/gi

// Every seam name referenced in `text`, in source order (may repeat).
function seamNames(text) {
  const out = []
  for (const m of text.matchAll(SEAM_RE)) out.push(m[1])
  return out
}

/**
 * Replace every `<!-- seam:NAME -->` in `text` with `fragments[NAME]` (an
 * absent/undefined fragment fills the seam with nothing). The result never
 * contains a raw seam marker, so a build can't ship a dangling placeholder.
 */
function composeText(text, fragments = {}) {
  return text.replace(SEAM_RE, (_marker, name) => {
    const frag = fragments[name]
    return frag == null ? '' : String(frag).replace(/\s+$/, '')
  })
}

/**
 * Load provider seam fragments from a directory of `NAME.md` files, keyed by
 * `NAME`. Each fragment file may open with an explanatory HTML comment block
 * (documenting where it injects) — that leading comment is stripped so only the
 * body is injected. Missing directory → no fragments (the base case).
 */
function loadFragments(seamsDir) {
  const out = {}
  let entries
  try {
    entries = fs.readdirSync(seamsDir)
  } catch {
    return out
  }
  for (const file of entries) {
    if (!file.endsWith('.md')) continue
    const name = file.slice(0, -3)
    const raw = fs.readFileSync(path.join(seamsDir, file), 'utf8')
    const body = raw.replace(/^﻿?\s*<!--[\s\S]*?-->\s*/, '')
    out[name] = `${body.trim()}\n`
  }
  return out
}

/**
 * Copy every asset under `srcDir` into `outDir`, filling seams in `.md` files
 * from `fragments` and copying all other files byte-for-byte. Creates `outDir`.
 */
function composeAssets(srcDir, outDir, fragments = {}) {
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(srcDir, rel), { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name)
      const src = path.join(srcDir, childRel)
      const dst = path.join(outDir, childRel)
      if (entry.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true })
        walk(childRel)
      } else if (entry.name.endsWith('.md')) {
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        fs.writeFileSync(dst, composeText(fs.readFileSync(src, 'utf8'), fragments))
      } else {
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        fs.copyFileSync(src, dst)
      }
    }
  }
  fs.mkdirSync(outDir, { recursive: true })
  walk('.')
}

module.exports = { SEAM_RE, seamNames, composeText, loadFragments, composeAssets }

// CLI: node scripts/compose.js <srcAssetsDir> <outDir> [providerSeamsDir]
// With no seams dir, produces the base distribution (all seams emptied).
if (require.main === module) {
  const [srcDir, outDir, seamsDir] = process.argv.slice(2)
  if (!srcDir || !outDir) {
    console.error('usage: compose.js <srcAssetsDir> <outDir> [providerSeamsDir]')
    process.exit(2)
  }
  const fragments = seamsDir ? loadFragments(seamsDir) : {}
  composeAssets(srcDir, outDir, fragments)
  const label = seamsDir ? `with fragments from ${seamsDir}` : 'base (seams emptied)'
  console.log(`composed ${srcDir} → ${outDir} ${label}`)
}
