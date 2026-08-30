# Phase 1 — `/spec-hotfix` adopts an issue ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-hotfix <tag> SKI-123` starts a hotfix from the issue that
reported it — the issue becomes the spec's issue, and the base tag is still
confirmed by a human.

## Tasks

- [ ] Add `<!-- seam:spec-tracker-intake -->` to `/spec-hotfix`, before its
      step 1 (establishing the tag), matching where `/spec` and `/spec-bug` run
      intake — adoption seeds the material the rest of the skill works from.
- [ ] Generalise the intake fragment for a third caller: it currently names
      `/spec` and `/spec-bug` in its routing and adoption text. Keep one fragment
      — do not fork a hotfix copy.
- [ ] State the argument grammar in `/spec-hotfix`: `<tag> <ref>`, `<ref>` alone,
      or `--from-issue [query]`. An argument shaped `LETTERS-DIGITS` is an issue
      ref, never a spec name (Decision 3).
- [ ] Have the tag step **offer** version-looking strings found in the adopted
      issue, clearly as suggestions, and still require the user's answer. Never
      proceed on a scan alone (Decision 2).
- [ ] Derive the spec name from the issue title when no name was given, prefixed
      `hotfix-`, so the folder still reads as a hotfix.
- [ ] Confirm the adoption rules already in the fragment hold for a hotfix: no
      project picker, no base sidecar, `linear_identifier`/`linear_url` stamped.
- [ ] Check nothing in the projection is tag-specific — `Base version:` is header
      prose, and workflow state comes from the folder bucket as usual.
- [ ] Add tests: `/spec-hotfix` carries the intake seam and it precedes the tag
      step; the fragment names all three callers and none of them exclusively;
      the grammar and the "a ref is never a name" rule are stated; the tag is
      asked for rather than inferred. Run the project's typecheck and test
      commands — green before the phase is done.

## Notes

The order matters: intake runs **before** the tag step, so the issue is in hand
when the skill asks which version prod is running — that is what lets it offer
the versions the report mentions.
