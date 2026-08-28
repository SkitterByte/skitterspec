# Phase 1 — Flatten nested tables in the projection ✅

> **Status:** Done

## Goal

A table nested in a list item reaches Linear in a shape Linear cannot mangle,
with every character preserved, and no spec file on disk is touched.

## Tasks

- [x] Write the failing test first: the reporter's exact indent-3 auth-header
      table, asserting the projected description contains
      `X-Extraction-Key` and `shared secret, from Key Vault` in a form that is
      not an indented table row. Red before the fix.
- [x] Add `packages/sync-core/src/tables.js` with `flattenNestedTables(md)`:
      find each table whose rows are indented (header line + separator line +
      data rows, all starting `|` after whitespace), skipping anything inside a
      fence via the existing `fenceMask`.
- [x] 2-column tables → a bullet list at the table's own indent, one bullet per
      row, cells joined with ` — `; the header row emitted first with each cell
      bolded (Decision 3).
- [x] Every other column count → wrap the original lines verbatim in a fenced
      code block at the same indent. Verified intact under nesting on SKI-28.
- [x] Leave column-0 tables completely alone — the `## Phases` index and every
      Impact map must project byte-identically as today.
- [x] Apply it in the projection only, to the issue description and each phase
      sub-issue goal. Never to files on disk.
- [x] Tests: the reporter's exact input; a 3-column nested table fences; a
      column-0 table is untouched; a table inside a fenced example block is
      untouched; a 2-space table under a bullet flattens; cells containing pipes
      in inline code do not split wrongly; an indented table with no separator
      row is not treated as a table.
- [x] Assert the no-disk-write contract: project a fixture spec, then compare
      the on-disk bytes before and after — unchanged.
- [x] Run the full suite; green before the phase is done.
