---
linear_issue_id: "SKS-168"
---

# Phase 1 — The verdict in the engine ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a blob can carry a verdict, the engine validates it, refuses an
approval that contradicts an open note, and records what was decided — all
provable through the CLI with no page change.

## Tasks

- [ ] Accept `verdict` in `validateNotesBlob`: `approve`, `changes` or
      `discuss`, or absent. An unknown value is **refused by name** rather than
      coerced — a typo'd verdict silently reading as `discuss` would be a review
      that quietly did nothing.
- [ ] Treat an absent verdict as `discuss` at the point of *use*, not by
      rewriting the blob. The stored pass should record what was actually sent.
- [ ] **Refuse `approve` while any comment is unresolved** — counting the notes
      already stored plus any arriving in the same blob. Name the count and the
      files. This is the one accusing check the phase adds, and it is biased the
      safe way: refusing to approve costs a re-paste, approving what you asked to
      change costs a wrong commit.
- [ ] **Merge the comments anyway when an approval is refused.** The notes are
      good work regardless of the verdict being wrong, and losing them would
      punish the mistake twice.
- [ ] Never block on **unaccepted files** — not here, not anywhere. Decision 3.
- [ ] Add the outcome log: `decisions: [{ verdict, at, note }]` in the sidecar,
      appended when a verdict is acted on. History, not state — nothing reads it
      to decide anything (Decision 6).
- [ ] Surface it in `--json`: the verdict as sent, whether it was honoured, and
      the reason when it was not. This is what the skill routes on, so it must be
      complete enough to route from without reading the diff.
- [ ] Say the verdict in the human output, once, in the existing `notes:` block.
- [ ] Tests: each verdict validates; an unknown one is refused; approve with an
      open note is refused **and the comments still land**; approve with only
      unaccepted files is **allowed**; an absent verdict behaves as discuss; the
      outcome log appends rather than replaces.
- [ ] Add the **stays-silent** case: a blob with no verdict produces byte-identical
      behaviour to today, and a spec with no notes gains no `decisions` key.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The refusal lives in the **engine**, not only on the page. The page disabling the
button is the courtesy; the engine is the guarantee, because a blob can be
hand-edited, re-pasted from a stale tab, or replayed after notes were added
elsewhere.
