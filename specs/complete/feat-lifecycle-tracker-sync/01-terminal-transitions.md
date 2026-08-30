# Phase 1 — The sync fragment + terminal transitions ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** finishing or cancelling a spec refreshes its Linear issue as part of
the same command, so a completed spec never sits in the mirror as In Progress.

## Tasks

- [x] Add `packages/linear/assets/seams/spec-tracker-sync.md`: refresh the mirror
      by running `/spec-push`, without asking. It states the three conditions —
      config present, spec carries a `linear_identifier`, and a failure is
      reported but never fatal — and says why it sits where it does.
- [x] Add `<!-- seam:spec-tracker-sync -->` to `/spec-complete` step 4,
      **after the `git mv` and before the `git add specs/ && git commit`**
      (Decision 6: the projection reads state from the folder bucket, and
      `integrate` refuses a dirty tree).
- [x] Add the same marker to `/spec-cancel` at the equivalent point in its move
      + commit step.
- [x] Mention the refresh in each skill's report step.
      **Done in the fragment, not the skill** — see Notes: editing the shared
      report step leaked provider prose into the tracker-free base distribution.
- [x] Guard the seam set itself: every referenced marker has a fragment, and no
      base skill ships a dangling one.
- [x] Confirm the commit in each skill picks up what the push writes — the
      stamped frontmatter and the `specs/.core/linear-base/` snapshot are both
      under `specs/`, so the existing `git add specs/` already covers them.
- [x] Add tests: both skills carry the marker; it sits between the move and the
      commit in the source order; the Linear build fills it and the base build
      leaves nothing behind; the fragment states the unlinked-skip and the
      non-fatal rules. Run the project's typecheck and test commands — green
      before the phase is done.

## Notes

The ordering is the whole trick, and it is easy to get wrong in either direction:
push before the `git mv` and the issue is set to the state it is leaving; push
after the commit and the branch cannot land. Both failure modes are asserted, and
the assertion was checked against both — it catches a marker moved either way.

**Course-correction: the report step belongs in the fragment.** The plan said to
mention the refresh in each skill's report step. Doing that edited
`packages/common`, which ships to the **base** distribution — so a tracker-free
install started talking about mirrors and ticketing providers. The build test
caught it. The fragment already carries a "say what happened" bullet, so the
skill edit was redundant as well as wrong; it was reverted and the base is
untouched.

**Two guards added beyond the plan.** A seam marker with no fragment composes to
nothing in the *superset* too — the build succeeds, the skill ships, the provider
step is silently absent. Nothing checked that, so now `every seam referenced by a
skill has a fragment` does. And the base's dangling-marker check only looked at
`/spec`; with seams now in six skills it walks all of them.
