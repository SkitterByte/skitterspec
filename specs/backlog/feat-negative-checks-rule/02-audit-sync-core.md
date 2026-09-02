# Phase 2 — Audit the sync-core checks ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every accusing check in `sync-core` either proves it stays silent on a
healthy-but-unusual input, or is corrected — with its blind spot named in a
comment.

## Tasks

- [ ] `lintPhases` (`normalize.js:420`) — enumerate what it accuses a spec of,
      and add a stays-silent test per case: a legacy bare `<name>.md` spec, an
      overview with no phase index, and a phase whose three status markers agree.
      It already declines to fail on a missing overview; make that a test rather
      than a comment.
- [ ] `compareStored` (`verify.js`) — confirm the reformatting Linear legitimately
      applies still reports intact: renumbered ordered lists, `-`→`*`, collapsed
      table separators, checkbox case, whitespace. Add any not already covered,
      and a test that a genuinely lost word is still reported.
- [ ] `deriveRecordedKey` / `planRetarget` (`retarget.js`) — assert a repo with no
      stamps at all, and one whose stamps disagree, both refuse rather than
      guessing; and that a prose-only identifier never makes a plan non-empty.
- [ ] For each check above, add a one-line comment naming what would blind it —
      the input shape that makes its evidence incomplete.
- [ ] Where a check is found to accuse wrongly, fix it by preferring a positive
      signal, and record the correction in the spec Changelog.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Expect most of these to pass already. The value is the same as the archived-refs
test in `cli-retarget`: a passing stays-silent test is what stops the next person
optimising the blind spot back in.

If a check turns out to have no false-positive mode at all, say so in its comment
rather than adding a hollow test.
