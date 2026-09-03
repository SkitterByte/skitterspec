---
linear_issue_id: "SKS-37"
---

# Phase 3 — The backstop checks placement, not presence ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** adding a lifecycle skill forces its last progress write to be named, so
the next occurrence of this defect fails the suite instead of passing it.

## Tasks

- [ ] Rewrite `every skill that changes spec state carries a tracker seam`
      (`packages/common/test/assets.test.js:308`) so each map entry is
      `[seam, lastWriteMarker]` and the test asserts
      `text.indexOf(seam) > text.indexOf(lastWriteMarker)` as well as presence.
- [ ] Populate all seven entries: `spec`, `spec-bug`, `spec-hotfix`, `spec-go`,
      `spec-complete`, `spec-cancel`, `spec-review`. Reuse each skill's real
      anchor text rather than inventing one, so a reworded step fails loudly
      instead of silently matching nothing.
- [ ] Assert every `lastWriteMarker` is actually **found** (`!== -1`) before
      comparing. A marker that has drifted out of the asset makes `indexOf`
      return `-1`, which compares as "seam is after it" and passes vacuously —
      the exact failure mode that let this defect ship.
- [ ] Add the **stays-silent test** required by
      `.claude/rules/negative-checks.md` rule 3: a skill whose seam is correctly
      placed must not be accused. Feed the check a healthy-but-unusual input — a
      skill with two seams where only the later one follows the write — and
      assert it stays quiet.
- [ ] Keep `the skills that change no status carry no tracker seam` unchanged;
      `/spec-to-main` and `/spec-live` remain deliberately seam-free.
- [ ] Name the blind spot beside the check (rule 2): this map is hand-maintained,
      so a **new** lifecycle skill absent from it is not checked at all. State
      that in a comment rather than implying the check is exhaustive.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Deliberately not a prose scanner — see decision 5. `spec-review:63` defines the
`⬜`/`🔄`/`✅` convention in prose, so any scanner keyed on those glyphs accuses a
skill that is already correct.
