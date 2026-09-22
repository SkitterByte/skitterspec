'use strict'

/**
 * The markdown-form reduction both dialects compare through. Every transform
 * here is a benign difference between two spellings of the same markdown —
 * a reserialising editor's (Linear rewrites bullets, renumbers lists,
 * case-folds checkboxes, collapses separator rows on save) or a round-trip
 * renderer's (the ADF reducer re-emits `-` bullets and `| -- |` separators
 * whatever the source used). Normalised away BEFORE comparing, so an intact
 * mirror never reports as data loss; digits stay significant everywhere else —
 * a port, a version, a key length still count.
 */

function canonicalForCompare(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        // Ordered-list markers → a placeholder. Linear renumbers lists, and the
        // digits it rewrites are alphanumeric, so a naive alphanumeric compare
        // would flag its own benign reformat as data loss. Normalising the
        // marker keeps digits significant EVERYWHERE ELSE — a port, a version, a
        // key length still count.
        .replace(/^(\s*)\d+\.(\s)/, '$1#.$2')
        // Unordered markers unify (`-`/`+` come back as `*`).
        .replace(/^(\s*)[*+-](\s)/, '$1-$2')
        // Checkbox marks case-fold. Targeted rather than lowercasing the whole
        // text, so a genuine case corruption in prose is still caught.
        .replace(/^(\s*-\s*\[)[xX](\])/, '$1x$2')
        // Table separator rows collapse (`|-------|` → `| -- |`).
        .replace(/^\s*\|[\s:|-]+\|\s*$/, '|--|')
        .replace(/[ \t]+$/, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
module.exports = { markdownCanonicalForCompare: canonicalForCompare }
