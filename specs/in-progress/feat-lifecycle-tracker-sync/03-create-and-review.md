# Phase 3 — Link on create, refresh after review ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a bug or hotfix spec reaches Linear when it is created, like a feature
spec does, and a reviewed spec's mirror stops going quietly stale.

## Tasks

- [ ] Add `<!-- seam:spec-tracker-link -->` to `/spec-bug`, after the spec is
      written (its §4) and before it drives the fix — so the issue exists while
      the work is happening, not after it.
- [ ] Add the same marker to `/spec-hotfix` at the equivalent point. It has no
      tracker step at all today, so also check whether it wants the intake seam
      `/spec-bug` already carries.
- [ ] Add `<!-- seam:spec-tracker-sync -->` to `/spec-review`, after the spec is
      updated, so a rewritten spec refreshes what it changed.
- [ ] Check the link fragment reads correctly from a bug/hotfix context — it was
      written for `/spec`'s Phase E and must not assume that surrounding prose.
      Generalise its wording rather than forking a second copy.
- [ ] Mention the link or refresh in each skill's report step.
- [ ] Add tests: all three skills carry their marker; both fragments compose for
      the Linear build and vanish for the base; a spec-type-agnostic reading of
      the link fragment (no `/spec`-only references). Run the project's typecheck
      and test commands — green before the phase is done.

## Notes

`/spec-hotfix` is the one to watch: it forks from a release tag rather than
`main`, and its spec carries a `Base version:` header. Linking it is the same
operation, but confirm the projection has nothing tag-specific to say before
assuming it just works.
