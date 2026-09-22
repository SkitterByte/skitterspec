'use strict'

/**
 * The Linear markdown DIALECT — every transform that exists because of how
 * Linear's editor reserialises or corrupts markdown on save. Extracted from the
 * neutral engine (sync-core) so the engine carries no tracker's quirks: the
 * loader attaches this object to `config.dialect`, and the engine calls its
 * hooks wherever it used to call these functions directly.
 *
 * Three hooks (see sync-core `src/dialect.js` for the contract):
 *   - `canonicalize`       — Linear rewrites bullets, trims trailing space and
 *                            mangles emphasis straddling a line break.
 *   - `flattenTables`      — Linear truncates data cells of tables nested in
 *                            list items (measured on SKI-28).
 *   - `canonicalForCompare`— Linear renumbers ordered lists, unifies bullet
 *                            markers, case-folds checkboxes and collapses table
 *                            separator rows on save.
 *
 * Everything here is pure string → string.
 */

const { flattenNestedTables, splitCells } = require('@skitterbyte/skitterspec-provider-kit/src/md-tables.js')

// Linear mangles inline emphasis whose markers straddle a hard line break: it
// terminates the run at end-of-line and restarts it at the next, so `**a\nb**`
// comes back as `**a****\n****b**`, `*a\nb*` as `*a**\n**b*`, and a link splits
// into two. Canonicalise BOTH representations — the clean straddle we author and
// the mangled form Linear returns — to the same single-line span, so an
// already-mangled remote stops reading as a spurious `remote-only` diff and the
// payload we push carries no straddle for Linear to mangle again. Idempotent: a
// joined span has no interior newline, so nothing re-fires. Repo files are never
// rewritten — this only shapes the normalized projection the compare/push see.
function joinEmphasisAcrossBreaks(text) {
  let s = String(text)
  // (1) Repair Linear's mangle artifacts first — an emphasis run terminated at
  // end-of-line and restarted at the next. These are very specific asterisk runs
  // flanking a break, so a targeted regex is safe:
  //   bold:   `**X****\n****Y**` → the `****\n****` empty-bold artifact → a space.
  s = s.replace(/\*{4}[ \t]*\n[ \t]*\*{4}/g, ' ')
  //   italic: `*X**\n**Y*` — the `**\n**` artifact sits INSIDE a single-`*` span;
  //   gate on the enclosing single `*` so a genuine pair of adjacent bolds at a
  //   line boundary (`a**\n**b`) is left alone.
  s = s.replace(/(^|[^*\n])\*([^*\n]+)\*\*[ \t]*\n[ \t]*\*\*([^*\n]+)\*(?![*])/g, '$1*$2 $3*')
  //   link split across a break onto the same url → one link.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)[ \t]*\n[ \t]*\[([^\]]+)\]\(\2\)/g, '[$1 $3]($2)')
  // (2) Join the clean straddle we author — a newline that falls while an
  // emphasis/link span is OPEN. A scanner (not a regex) so an opening `**` is
  // never mis-paired with an unrelated closing `**` on the next line, and markers
  // inside a `code span` are ignored (Linear only rejoins those, harmlessly).
  return joinOpenSpans(s)
}

// Walk the text tracking whether we're inside a `**bold**`, `*italic*`, `[link
// text]`/`(url)`, or `` `code` `` span. A newline encountered while a
// non-code span is open joins the two lines with a single space (dropping the
// next line's indentation); every other newline is preserved.
function joinOpenSpans(text) {
  const out = []
  let bold = false
  let italic = false
  let code = false
  let link = 0 // 0 none · 1 in link text · 2 in url
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\n') {
      if (!code && (bold || italic || link)) {
        // Skip the continuation's indentation AND any blockquote marker (`>`) —
        // a span wrapped across two `> …` lines is one quoted run, so the join
        // must drop the continuation `>` rather than swallow it into the text.
        // Then join: a word wrapped at a hyphen (`state-entry-with-`⏎`assignment`)
        // is one compound — join TIGHT (no space); otherwise a single space.
        let j = i + 1
        while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '>')) j++
        const softHyphen = text[i - 1] === '-' && /\w/.test(text[i - 2] || '') && /\w/.test(text[j] || '')
        if (!softHyphen) out.push(' ')
        i = j - 1
      } else {
        out.push('\n')
      }
      continue
    }
    if (c === '`') {
      code = !code
      out.push(c)
      continue
    }
    if (code) {
      out.push(c)
      continue
    }
    if (c === '*' && text[i + 1] === '*') {
      bold = !bold
      out.push('**')
      i++
      continue
    }
    if (c === '*') {
      // Basic flanking so a stray `*` (e.g. `2 * 3`) doesn't open a phantom span:
      // an opener needs a non-space to its right, a closer a non-space to its left.
      const ok = italic ? !/\s/.test(text[i - 1] || '') : !/\s/.test(text[i + 1] || '')
      if (ok) italic = !italic
      out.push(c)
      continue
    }
    if (c === '[' && link === 0) {
      link = 1
      out.push(c)
      continue
    }
    if (c === ']' && link === 1) {
      if (text[i + 1] === '(') {
        link = 2
        out.push('](')
        i++
      } else {
        link = 0
        out.push(c)
      }
      continue
    }
    if (c === ')' && link === 2) {
      link = 0
      out.push(c)
      continue
    }
    out.push(c)
  }
  return out.join('')
}

// Canonicalise markdown so semantically-equal content hashes equal across the
// boundary. Linear reserializes markdown on save (authored `-` bullets come back
// as `*`, trailing whitespace trimmed, blank runs collapsed, emphasis spanning a
// line break mangled), so without this a clean push→pull would report
// `description` as perpetually changed. Applied to the description on BOTH sides.
// Conservative: only unifies list markers, whitespace, and emphasis-across-a-break
// — the transforms actually observed from Linear.
function canonicalizeMarkdown(text) {
  if (text == null) return text
  const marked = String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    // Unordered-list marker at line start (`*`/`+`/`-`) → `-`. Requires a space
    // after the marker so bold/emphasis (`**Goal:**`) is untouched. Done BEFORE
    // the emphasis join so a `*` list bullet can't spoof an italic delimiter.
    .map((line) => line.replace(/^(\s*)[*+-]( +)/, '$1-$2').replace(/[ \t]+$/, ''))
    .join('\n')
  return joinEmphasisAcrossBreaks(marked)
    // A word wrapped at a hyphen within a paragraph (`state-entry-with-`⏎
    // `assignment`) rejoins TIGHT — otherwise Linear (CommonMark) renders the
    // soft line break as a space and corrupts the compound. Single newline only,
    // so paragraph breaks are preserved.
    .replace(/(\w-)[ \t]*\n[ \t]*(?=\w)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Linear reserialises markdown on save; the reduction that makes those
// transforms invisible is shared with the ADF dialect and lives in the kit.
const { markdownCanonicalForCompare: canonicalForCompare } = require('@skitterbyte/skitterspec-provider-kit/src/md-compare.js')


// The dialect object the config loader attaches (`config.dialect`).
const dialect = Object.freeze({
  canonicalize: canonicalizeMarkdown,
  flattenTables: flattenNestedTables,
  canonicalForCompare,
})

module.exports = {
  dialect,
  canonicalizeMarkdown,
  joinEmphasisAcrossBreaks,
  flattenNestedTables,
  splitCells,
  canonicalForCompare,
}
