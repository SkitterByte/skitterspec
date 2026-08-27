# Phase 3 — Issue intake seam & adoption ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec SKI-123` and `/spec --from-issue [query]` start a spec from an
existing Linear issue, adopting that issue as the spec issue.

## Tasks

- [ ] Add a `<!-- seam:spec-tracker-intake -->` marker near the top of
      `packages/common/assets/skills/spec/SKILL.md` (before Phase A) and to
      `packages/common/assets/skills/spec-bug/SKILL.md`; confirm the base build
      still leaves no dangling marker (`scripts/compose.test.js`,
      `scripts/build-dist.test.js`).
- [ ] Write `packages/linear/assets/seams/spec-tracker-intake.md`: resolve a bare
      `<ISSUE-REF>` via `readIssue`; with `--from-issue`, list the inbox via
      `searchIssues({ label: intake.label, teamId })` and filter by the query
      fragment when one is given.
- [ ] Exclude already-adopted issues using `spec-sync linked`; refuse a direct
      `/spec <ISSUE-REF>` naming an adopted issue and point at the existing spec.
- [ ] Seed the grill from the issue: title → spec title, body → the **Problem**
      section's starting material, reporter/url noted for the author. Grilling
      still happens — intake seeds it, it does not skip it.
- [ ] Stamp `linear_identifier` (and `linear_url`) = the adopted issue's values in
      the overview frontmatter, and **do not** run the project picker (Decision 6)
      or send `project` on any subsequent push.
- [ ] Run `skitterspec spec-sync normalize <spec>` after adoption (as the link seam
      does) so the first `/spec-push` takes the **update** path on the existing
      issue rather than minting a duplicate — add a test for that path.
- [ ] Add/extend tests: seam fragment present in the linear build and absent from
      the base build; `linked`-based dedup refusing a re-adopt. Run the project's
      typecheck and test commands — green before the phase is done.

## Notes

Adoption is the one case where a spec is born already linked. Everything
downstream (`/spec-push`, `/spec-status`, `/spec-go`'s seam) keys off
`linear_identifier` being present, so no other skill needs changing.
