# Phase 1 — `update` says what it skipped ⬜

> **Status:** Not started

**Goal:** after an `update`, a user can see what each `customized (kept)` file
declined without opening `node_modules`.

## Tasks

- [ ] Add `linesDiff(a, b)` to `packages/common/src` — a small LCS over lines
      returning `{ added, removed, hunks }`. Zero dependencies (Decision 2).
- [ ] Unit-test `linesDiff`: identical input, pure insert, pure delete, an
      interleaved change, and empty-vs-nonempty.
- [ ] Carry the counts on the report: `report.customized` entries become
      `{ relPath, added, removed }`, computed in `resyncManagedFile` where
      `bundled` is already in hand.
- [ ] Render them in `printReport` (`init.js:515`) —
      `specs/.core/linear.config.md  +34 −13`.
- [ ] Add `--diff` to the `update` CLI: after the report, print the unified hunks
      for every kept file. Wire it through `resync(dir, opts)`.
- [ ] Test the CLI output: a customized file shows non-zero counts; an unchanged
      one is absent from the customized list entirely.
- [ ] Update the `update` usage/help text and the README section that describes
      what `update` reports.
- [ ] GREEN — `node --test packages/common` green; full suite green. Commit with
      a `Release-Note:`.
