---
linear_issue_id: "SKI-20"
---

# Phase 3 — Issue intake seam & adoption ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec SKI-123` and `/spec --from-issue [query]` start a spec from an
existing Linear issue, adopting that issue as the spec issue.

## Tasks

- [x] Add a `<!-- seam:spec-tracker-intake -->` marker near the top of
      `packages/common/assets/skills/spec/SKILL.md` (before Phase A) and to
      `packages/common/assets/skills/spec-bug/SKILL.md`; confirm the base build
      still leaves no dangling marker (`scripts/compose.test.js`,
      `scripts/build-dist.test.js`).
- [x] Write `packages/linear/assets/seams/spec-tracker-intake.md`: resolve a bare
      `<ISSUE-REF>` via `readIssue`; with `--from-issue`, list the inbox via
      `searchIssues({ label: intake.label, teamId })` and filter by the query
      fragment when one is given.
- [x] Exclude already-adopted issues using `spec-sync linked`; refuse a direct
      `/spec <ISSUE-REF>` naming an adopted issue and point at the existing spec.
- [x] Seed the grill from the issue: title → spec title, body → the **Problem**
      section's starting material, reporter/url noted for the author. Grilling
      still happens — intake seeds it, it does not skip it.
- [x] Stamp `linear_identifier` (and `linear_url`) = the adopted issue's values in
      the overview frontmatter, and **do not** run the project picker (Decision 6)
      or send `project` on any subsequent push.
- [x] ~~Run `skitterspec spec-sync normalize <spec>` after adoption~~ — **inverted**:
      adoption must write **no** base sidecar. See Notes; tested either way.
- [x] Add/extend tests: seam fragment present in the linear build and absent from
      the base build; `linked`-based dedup refusing a re-adopt. Run the project's
      typecheck and test commands — green before the phase is done.

## Notes

Adoption is the one case where a spec is born already linked. Everything
downstream (`/spec-push`, `/spec-status`, `/spec-go`'s seam) keys off
`linear_identifier` being present, so no other skill needs changing.

**The snapshot task was backwards, and it uncovered a live bug.** The task said to
record a snapshot after adoption "so the first push takes the update path". The
update-vs-mint choice is driven purely by `linear_identifier` being stamped; the
snapshot decides *whether there is anything to push*. Recording one on adoption
would declare the mirror in sync and leave the issue showing the raw bug report
forever. So adoption writes **no** sidecar, and the first push overwrites the
description — the opposite of the written task, and pinned by a test both ways.

Chasing that down surfaced a real defect in the shipped `/spec` skill: the
`spec-tracker-link` seam told the model to run `spec-sync normalize` to "capture
the local snapshot as the committed base". `normalize` only *prints* the
projection — `record` is the writer. So every freshly-linked spec has been left
with no base sidecar since one-way sync shipped. Corrected in the seam (its first
`/spec-push` was merely a harmless full re-push, so nothing was lost).
