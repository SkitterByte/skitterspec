# Phase 3 — Coverage invariant: nothing goes unmirrored ✅

> **Status:** Done

**Goal:** make silent content loss impossible to reintroduce. A fixture set
proves the shapes we thought of; an invariant proves the ones we did not.

## Tasks

- [x] Add a pure helper (test-side is fine) that, given a phase body, returns the
      set of line indices belonging to any task subtree — derived from the
      indentation alone, independent of `findTaskBlocks`.
- [x] RED against the pre-Phase-1 parser — assert
      `subtreeLines(body) ⊆ claimedLines(findTaskBlocks(body))` and watch it fail
      on the reported shape, so the invariant is proven to have teeth.
- [x] Run the invariant over this repo's own spec corpus (`specs/**/[0-9][0-9]-*.md`)
      as a single test — a real corpus, not just fixtures.
- [x] Decide and document what the invariant does with a genuinely unparseable
      shape: it asserts (test-only), it does **not** become a runtime warning.
      Runtime already has the `lintPhases` channel and this is a parser
      guarantee, not a spec-authoring one.
- [x] GREEN — invariant passes on the fixed parser and across the corpus.
