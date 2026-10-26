'use strict'

/**
 * The Azure Boards dialect — how projections are shaped for, and read back
 * from, a tracker whose large-text fields hold MARKDOWN.
 *
 * Boards stores a markdown-format description verbatim (the phase 1 spike
 * round-tripped it byte-identical), so unlike ADF there is no renderer to
 * convert for — the adapter writes the projection's markdown as-is and sets
 * `multilineFieldsFormat` beside it. What the dialect hooks carry (sync-core
 * `src/dialect.js`):
 *
 *   - `canonicalize` — the same light markdown canonicalisation the other
 *     providers apply to the outbound projection: bullet markers unify,
 *     trailing whitespace and blank runs collapse.
 *   - `flattenTables` — IDENTITY, deliberately. Jira flattens because ADF's
 *     `listItem` cannot hold a `table`; Boards stores the markdown untouched,
 *     so reshaping it would change content for no renderer's benefit.
 *   - `canonicalForCompare` — the shared markdown-form reduction (kit
 *     `src/md-compare.js`), so a read-back differing only in list markers or
 *     table separators never reads as drift.
 *
 * `htmlToText` is the READ-side half: a work item created in the Boards UI
 * before anyone chose markdown — every intake-adopted item — comes back as
 * HTML, and `preserve` and verify need its text. It is a reduction for
 * comparison and preservation, not a renderer.
 */

const { markdownCanonicalForCompare } = require('@skitterbyte/skitterspec-provider-kit/src/md-compare.js')

function canonicalizeMarkdown(text) {
  if (text == null) return text
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^(\s*)[*+-]( +)/, '$1-$2').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] || m)
}

// Does this read-back smell like the HTML era rather than markdown? A tag pair
// or a self-closed break is the positive signal; a markdown description that
// merely mentions `<br>` in a code span is rare enough to accept the cost of
// decoding it (the reduction is for comparison, never written back).
function looksLikeHtml(text) {
  // No whitespace after `<`, exactly as an HTML parser demands — `a < b … >`
  // in ordinary markdown prose must not read as a tag.
  return /<(p|div|br|li|ul|ol|b|i|em|strong|span|a|h[1-6]|table|tr|td)\b[^>]*\/?>/i.test(text)
}

/**
 * Reduce an HTML-era description to readable text: block boundaries become
 * newlines, list items become `- ` bullets, every other tag drops, entities
 * decode. Lossy by design — it feeds `preserve` comments and canonical
 * comparison, and is never sent back to Boards.
 */
function htmlToText(html) {
  if (html == null) return html
  return decodeEntities(
    String(html)
      .replace(/\r\n/g, '\n')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '\n- ')
      // No newline for a closing </li>: the NEXT item's opening tag supplies
      // one, and emitting both blank-lines every list apart.
      .replace(/<\s*\/\s*(p|div|ul|ol|h[1-6]|tr|table)\s*>/gi, '\n')
      .replace(/<\s*(p|div|ul|ol|h[1-6]|table|tr)\b[^>]*>/gi, '\n')
      .replace(/<\s*\/?\s*[a-z][^>]*>/gi, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Azure's storage transform, observed live (phase: bug-azure-boards-adoption-
// fixes): a markdown description comes back with stray HTML specials
// entity-encoded, and TAG-SHAPED TOKENS STRIPPED ENTIRELY — `<bucket>` and
// `<name>` vanish from `specs/<bucket>/<name>/…` even inside a backtick code
// span. Both transforms are applied to BOTH sides here, so an intact mirror
// compares clean: decoding is symmetric noise on already-decoded text, and
// stripping the sent side's tokens matches the sanitiser's deletions.
//
// BLIND SPOT, named deliberately: a Boards-side edit that only adds or removes
// a tag-shaped token is invisible to the compare — the same trade the
// word-character stream already makes for punctuation, and the same safe
// direction (`.claude/rules/negative-checks.md` rule 4).
function azureCanonicalForCompare(text) {
  const decoded = decodeEntities(String(text == null ? '' : text))
  return markdownCanonicalForCompare(decoded.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*>/g, ''))
}

const dialect = Object.freeze({
  canonicalize: canonicalizeMarkdown,
  // See the header: markdown is stored verbatim, so there is nothing to
  // reshape for. The hook stays so sync-core can call it unconditionally.
  flattenTables: (text) => text,
  canonicalForCompare: azureCanonicalForCompare,
})

module.exports = { dialect, canonicalizeMarkdown, htmlToText, looksLikeHtml, decodeEntities }
