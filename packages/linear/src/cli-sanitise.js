'use strict'

/**
 * `spec-sanitise` — a one-time maintenance pass over spec markdown.
 *
 * Rewrites files so no inline emphasis (`**bold**`, `*italic*`) or link text
 * straddles a hard line break, and repairs any Linear-mangled `****` artifacts
 * already committed. Hand-wrapped specs acquire straddles over time; Linear
 * corrupts them on save, so this brings the corpus "inline" to round-trip cleanly.
 *
 * Dry-run by default (reports the files it WOULD change); pass `--write` to apply.
 * Minimal-diff and idempotent — only paragraphs/items that actually straddle are
 * reflowed (see `sanitise.js`).
 *
 *   skitterspec-linear spec-sanitise [paths...] [--write] [--width N]
 *
 * Defaults to scanning `specs/`. Exit code 1 in dry-run when changes are pending
 * (so it's CI-friendly), 0 once everything is clean.
 */

const fs = require('node:fs')
const path = require('node:path')
const { sanitizeSpecMarkdown } = require('./sanitise.js')

// Recursively collect *.md files under a path (a file path is returned as-is).
function collectMarkdown(target) {
  const out = []
  const walk = (p) => {
    let st
    try {
      st = fs.statSync(p)
    } catch {
      return
    }
    if (st.isDirectory()) {
      // Skip VCS/deps, and `.core` — skitterspec's own manifest-managed docs.
      // Reflowing a managed file makes the next `update` see it as customized and
      // freeze the shipped version, silently pinning stale docs.
      if (/(^|\/)(node_modules|\.git|\.core)$/.test(p)) return
      for (const name of fs.readdirSync(p).sort()) walk(path.join(p, name))
    } else if (st.isFile() && p.endsWith('.md')) {
      out.push(p)
    }
  }
  walk(target)
  return out
}

// Translate a restricted glob (`*`, `**`) into an anchored RegExp fragment for
// substring matching against a repo-relative path.
function globToRe(glob) {
  let re = ''
  for (let k = 0; k < glob.length; k++) {
    const c = glob[k]
    if (c === '*') {
      if (glob[k + 1] === '*') { re += '.*'; k++ }
      else re += '[^/]*'
    } else if (/[.+^${}()|[\]\\?]/.test(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp(re)
}

function parseArgs(argv) {
  const paths = []
  const exclude = []
  let write = false
  let width = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--write') write = true
    else if (a === '--width') width = parseInt(argv[++i], 10)
    else if (a === '--exclude') exclude.push(argv[++i])
    else if (a === '--help' || a === '-h') return { help: true }
    else paths.push(a)
  }
  if (!paths.length) paths.push('specs')
  return { paths, write, width: Number.isFinite(width) ? width : null, exclude }
}

async function specSanitise(argv, { cwd = process.cwd(), out = process.stdout } = {}) {
  const opts = parseArgs(argv)
  if (opts.help) {
    out.write(
      'Usage: skitterspec-linear spec-sanitise [paths...] [--write] [--width N] [--exclude glob]...\n' +
        '  Optional cosmetic tidy: joins straddling emphasis/link spans and repairs\n' +
        '  mangled artifacts. One-way sync does not require it — the mirror is\n' +
        '  rendered clean on push regardless. Dry-run by default; exit 1 if pending.\n',
    )
    return 0
  }

  const excludeRes = opts.exclude.map(globToRe)
  const excluded = (rel) => excludeRes.some((re) => re.test(rel))
  const files = new Set()
  for (const p of opts.paths) {
    for (const f of collectMarkdown(path.resolve(cwd, p))) {
      if (!excluded(path.relative(cwd, f))) files.add(f)
    }
  }

  let changedFiles = 0
  let totalFixes = 0
  let refusedFiles = 0
  for (const file of [...files].sort()) {
    const src = fs.readFileSync(file, 'utf-8')
    const res = sanitizeSpecMarkdown(src, opts.width ? { width: opts.width } : {})
    const rel = path.relative(cwd, file)
    if (res.refused) {
      refusedFiles++
      out.write(`skipped  ${rel} (would alter structure — left untouched)\n`)
      continue
    }
    if (!res.changed) continue
    changedFiles++
    totalFixes += res.fixes
    if (opts.write) {
      fs.writeFileSync(file, res.text, 'utf-8')
      out.write(`fixed  ${rel} (${res.fixes} span${res.fixes === 1 ? '' : 's'})\n`)
    } else {
      out.write(`would fix  ${rel} (${res.fixes} span${res.fixes === 1 ? '' : 's'})\n`)
    }
  }

  if (refusedFiles) {
    out.write(`\n${refusedFiles} file(s) skipped as a safety check (a reflow would change structure — fix by hand).\n`)
  }
  if (!changedFiles) {
    out.write(`spec-sanitise: clean — no straddling spans in ${files.size} file(s).\n`)
    return refusedFiles ? 1 : 0
  }
  const verb = opts.write ? 'Fixed' : 'Would fix'
  out.write(`\n${verb} ${totalFixes} span(s) across ${changedFiles} file(s).\n`)
  if (!opts.write) {
    out.write('Re-run with --write to apply. Review the diff before committing.\n')
    return 1
  }
  return 0
}

module.exports = { specSanitise, collectMarkdown, parseArgs }
