# Phase 2 — Read-back verification ⬜

> **Status:** Not started

## Goal

After `/spec-push` applies a plan, what Linear stored is compared against what
was sent, and any loss of word characters is reported — catching this class of
corruption generically, including quirks not yet known.

## Tasks

- [ ] Add `packages/sync-core/src/verify.js` with a pure
      `compareStored(sent, stored)` returning `{ ok, lost, at, sentContext,
      storedContext }`.
- [ ] Normalise known-benign reformats before reducing: ordered-list markers to
      a placeholder (Decision 7), `-`/`+` bullets to `*`, table separator rows
      collapsed, checkbox marks case-folded, trailing whitespace and blank runs
      collapsed.
- [ ] Reduce both sides to their alphanumeric stream and compare; report the
      first divergence with surrounding context from each side.
- [ ] Add `spec-sync verify <spec> --stored <file>` to `cli-sync.js`. The file
      is JSON — `{ "issue": "…", "subIssues": { "01-slug": "…" } }` — written by
      the skill from what it read back, mirroring the `--workspace-states`
      split. Exit 0 with a warning block on divergence (Decision 8).
- [ ] State in `verify.js` why reading back is not a pull (Decision 6).
- [ ] Update the `/spec-push` skill: after step 4 applies the plan, read each
      touched issue's `description` back, write the JSON, run `verify`, and
      relay any divergence to the user. Before step 5's stamp, so a corrupted
      push is visible before the snapshot records it as good.
- [ ] Tests: a dropped character is caught; each listed benign reformat is not;
      ordered-list renumbering specifically is not (the reporter's rule fails
      here); an exact match reports clean; a missing/malformed `--stored` file
      fails clearly rather than passing silently.
- [ ] Assets test that the skill instructs the read-back and places it before
      the stamp.
- [ ] Document the check in `linear.config.md` and the dist README.
- [ ] Run the full suite; green before the phase is done.
