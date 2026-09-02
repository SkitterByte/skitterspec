# Phase 2 — Audit the sync-core checks ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every accusing check in `sync-core` either proves it stays silent on a
healthy-but-unusual input, or is corrected — with its blind spot named in a
comment.

## Tasks

- [x] `lintPhases` (`normalize.js:420`) — enumerate what it accuses a spec of,
      and add a stays-silent test per case: a legacy bare `<name>.md` spec, an
      overview with no phase index, and a phase whose three status markers agree.
      It already declines to fail on a missing overview; make that a test rather
      than a comment.
- [x] `compareStored` (`verify.js`) — confirm the reformatting Linear legitimately
      applies still reports intact: renumbered ordered lists, `-`→`*`, collapsed
      table separators, checkbox case, whitespace. Add any not already covered,
      and a test that a genuinely lost word is still reported.
- [x] `deriveRecordedKey` / `planRetarget` (`retarget.js`) — assert a repo with no
      stamps at all, and one whose stamps disagree, both refuse rather than
      guessing; and that a prose-only identifier never makes a plan non-empty.
- [x] For each check above, add a one-line comment naming what would blind it —
      the input shape that makes its evidence incomplete.
- [x] Where a check is found to accuse wrongly, fix it by preferring a positive
      signal, and record the correction in the spec Changelog.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Expect most of these to pass already. The value is the same as the archived-refs
test in `cli-retarget`: a passing stays-silent test is what stops the next person
optimising the blind spot back in.

If a check turns out to have no false-positive mode at all, say so in its comment
rather than adding a hollow test.

## Outcome

One check accused wrongly. `parsePhaseIndex` read a Status cell with no emoji as
the `not-started` **default**, and `lintPhases` then cross-checked against it —
so an overview stating a phase's status in words (`Done`) drew a warning quoting
the overview as saying `not-started`, a value nobody wrote, on a spec whose
load-bearing h1 was correct. Rows now carry `stated`, and only a row that used
the emoji vocabulary counts as evidence. The stays-silent test for it fails
against the old code, and a separate test pins that an emoji row still
disagrees loudly.

`compareStored` and `retarget` were already correct — their new tests are the
guard, not a fix. `compareStored`'s blind spot is the one the caller closes: a
`stored` that was never fetched reduces to `''` and reads as total loss, which
is why `verifyLines` gates on `typeof stored.issue === 'string'`.
