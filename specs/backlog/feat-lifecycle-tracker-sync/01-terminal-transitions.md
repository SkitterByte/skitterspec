# Phase 1 — The sync fragment + terminal transitions ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** finishing or cancelling a spec refreshes its Linear issue as part of
the same command, so a completed spec never sits in the mirror as In Progress.

## Tasks

- [ ] Add `packages/linear/assets/seams/spec-tracker-sync.md`: refresh the mirror
      by running `/spec-push`, without asking. It states the three conditions —
      config present, spec carries a `linear_identifier`, and a failure is
      reported but never fatal — and says why it sits where it does.
- [ ] Add `<!-- seam:spec-tracker-sync -->` to `/spec-complete` step 4,
      **after the `git mv` and before the `git add specs/ && git commit`**
      (Decision 6: the projection reads state from the folder bucket, and
      `integrate` refuses a dirty tree).
- [ ] Add the same marker to `/spec-cancel` at the equivalent point in its move
      + commit step.
- [ ] Mention the refresh in each skill's report step, so the transcript says
      whether the mirror was updated, skipped as unlinked, or failed.
- [ ] Confirm the commit in each skill picks up what the push writes — the
      stamped frontmatter and the `specs/.core/linear-base/` snapshot are both
      under `specs/`, so the existing `git add specs/` already covers them.
- [ ] Add tests: both skills carry the marker; it sits between the move and the
      commit in the source order; the Linear build fills it and the base build
      leaves nothing behind; the fragment states the unlinked-skip and the
      non-fatal rules. Run the project's typecheck and test commands — green
      before the phase is done.

## Notes

The ordering is the whole trick, and it is easy to get wrong in either direction:
push before the `git mv` and the issue is set to the state it is leaving; push
after the commit and the branch cannot land.
