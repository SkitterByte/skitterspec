# Phase 3 — Link on create, refresh after review ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a bug or hotfix spec reaches Linear when it is created, like a feature
spec does, and a reviewed spec's mirror stops going quietly stale.

## Tasks

- [x] Add `<!-- seam:spec-tracker-link -->` to `/spec-bug`, after the spec is
      written (its §4) and before it drives the fix — so the issue exists while
      the work is happening, not after it.
- [x] Add the same marker to `/spec-hotfix` at the equivalent point. It has no
      tracker step at all today, so also check whether it wants the intake seam
      `/spec-bug` already carries. **Checked — deliberately not added; see Notes.**
- [x] Update `spec-planning.md`, which still described the provider as plugging
      into "two named seams" and named the two by hand.
- [x] Add a backstop test: every lifecycle skill that changes spec state carries
      a tracker seam, and the two that change none carry none.
- [x] Add `<!-- seam:spec-tracker-sync -->` to `/spec-review`, after the spec is
      updated, so a rewritten spec refreshes what it changed.
- [x] Check the link fragment reads correctly from a bug/hotfix context — it was
      written for `/spec`'s Phase E and must not assume that surrounding prose.
      Generalise its wording rather than forking a second copy.
- [x] Mention the link or refresh in each skill's report step.
- [x] Add tests: all three skills carry their marker; both fragments compose for
      the Linear build and vanish for the base; a spec-type-agnostic reading of
      the link fragment (no `/spec`-only references). Run the project's typecheck
      and test commands — green before the phase is done.

## Notes

`/spec-hotfix` links like any other spec: the projection has nothing tag-specific
to say — `Base version:` is ordinary header prose, and the workflow state comes
from the folder bucket exactly as it does elsewhere.

**Intake for `/spec-hotfix`: checked, and deliberately not added.** Starting a
hotfix from a Linear issue would be coherent — a prod bug is often reported there
first — but it is a *separate feature*, not part of closing the sync hole, and it
has a real obstacle: the intake fragment adopts "a bare id anywhere in the
arguments", while `/spec-hotfix` already takes a required positional tag
(`/spec-hotfix v33.16.4 login-crash`). Those two argument grammars need
reconciling before the fragment can be injected safely. Recorded rather than
guessed at.

**A backstop, rather than trusting this stays done.** The point of this spec is
that no lifecycle skill is left without a tracker step, so the test asserts the
whole mapping — seven skills to their seam — instead of checking the three this
phase touched. Adding an eighth lifecycle skill now fails that test until someone
decides which seam it carries. The two that legitimately carry none
(`/spec-to-main`, `/spec-live`) are asserted too, so "none" reads as a decision
rather than an oversight.
