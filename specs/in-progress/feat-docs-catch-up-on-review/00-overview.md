---
linear_identifier: "SKS-310"
linear_url: "https://linear.app/skitterbyte/issue/SKS-310/the-docs-catch-up-on-the-review-loop-and-a-guard-keeps-them-there"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The docs catch up on the review loop, and a guard keeps them there

> **Type:** Feature
> **Name:** feat-docs-catch-up-on-review (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-17)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** packages/skitterspec/README.md, packages/skitterspec-linear/README.md, docs/index.html, docs/linear.html, packages/common/README.md, packages/common/test/
> **Stack:** worktree

## Problem

The user-facing docs never caught up with the review loop. Across the four
surfaces a user reads, there are **zero** mentions of `/spec-reviewed`, the
verdict buttons, `review.serve`, `review.required`, the serve token or
`commit-start` — the feature the last several majors were about.

It is not only absence. Two surfaces still document behaviour that was
deliberately **removed**: `packages/skitterspec/README.md:96` and
`docs/index.html:581` both show a `Review` row asking
*"want a written review before you commit?"*, which
`.claude/rules/spec-reports.md` now forbids under *asking implies waiting*. And
the **published** base README lists four commands that no longer ship anywhere —
`/spec-env`, `/spec-env-down`, `/spec-go`, `/spec-ready` — while missing two
that do: `/spec-reviewed` and `/spec-to-main`.

The cause is structural rather than anyone's oversight. `assets-offer-last.test.js`
asserts the *skill* stopped asking that question, and
`assets-report-contract.test.js` asserts the contract — so the rules and the
skills are guarded and the docs are not. They drifted for exactly as long as
that gap has existed.

## Decisions

1. **All four surfaces, phased by who reads them.** The two npm READMEs first,
   because they ship with v22 and are the ones carrying dead commands; then the
   docs site; then `packages/common/README.md`, which is developer-facing.
   Rejected doing only the npm pair: the site's *own* command reference is
   missing a live command.
2. **The guard checks both directions.** A **positive** check that every shipped
   skill and every `review.*` config key appears in the published docs, and a
   **negative** one that removed names do not. They catch opposite failures —
   something added and undocumented, versus something removed and still
   documented — and this repo already pairs a positive signal with a
   stays-silent test (`.claude/rules/negative-checks.md`).
3. **The command set is compared as a set, not searched for by name.** A list of
   known-bad strings only ever catches the mistakes someone already made;
   comparing the documented `/spec-*` set against the shipped one caught all six
   discrepancies here without knowing any of them in advance.
4. **The negative half names removed behaviour, not just removed commands.** The
   stale `Review` row is prose, not a command, so a set comparison cannot see it.
   That half is an explicit list with a reason beside each entry — the only shape
   that can cover prose, and therefore the one that has to be kept deliberately.
5. **Each phase ships on its own**, so the v22 release can go out after phase 1
   rather than waiting for the site.
6. **Depth belongs where the reader is.** The READMEs and the site get the loop —
   render, read, press, and what each verdict does. The mechanism behind it (the
   48-bit serve token, the claim window, why `/spec-reviewed` is user-only) stays
   in `.claude/rules/`, which is installed into a project rather than published
   as marketing. Rejected repeating it on all four: four copies of a security
   argument is four places for it to drift.

## Solution overview

Phase 1 rewrites the review sections of both published READMEs: the correct
command table, the page and its verdicts, the gate, and the `review.*` keys.
Phase 2 does the same for `docs/index.html` and `docs/linear.html`, whose
command reference is hand-maintained HTML with no build step. Phase 3 brings
`packages/common/README.md` in line. The guard lands in phase 1, so every later
phase is checked by it.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `packages/skitterspec/README.md`, `packages/skitterspec-linear/README.md` |
| Route/UI | update | `docs/index.html`, `docs/linear.html` — command reference + loop |
| Skill/rule | update | `packages/common/README.md` |
| Business rule | add | a test pairing documented commands/config against what ships |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The published READMEs, and the guard | ✅ | [01-the-npm-readmes.md](01-the-npm-readmes.md) |
| 2 | The docs site | ✅ | [02-the-docs-site.md](02-the-docs-site.md) |
| 3 | The developer-facing README | ✅ | [03-the-repo-readme.md](03-the-repo-readme.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created while preparing the v22 / v17 release, which is held
  until at least phase 1 lands: shipping a major whose README documents a
  removed question and four dead commands is the one thing a major should not do.
- 2026-09-17 — Phase 1: the guard landed first and failed on every count, then
  both READMEs were fixed. Decision 3's set comparison needed a **boundary** it
  did not have: scanned over a whole file it accuses the base README for naming
  the superset's commands and accuses an accurate version history for recording
  a removal, so each README now carries a marked `commands` region and the
  comparison reads that. The predicted six discrepancies were not the real ones
  — `/spec-remote-review` landed the same day and no hand-kept list would have
  known — which is the case for set comparison made by the thing itself.
- 2026-09-17 — Phase 2: both site pages gained a marked `commands` region and
  the base page's review section was **corrected rather than extended**. It was
  documenting the security model that existed before the phase learnt to wait —
  *"a device that reaches your page cannot reach your conversation"* — which is
  a worse failure than the absence the spec predicted, so that sentence and two
  others went into the negative half by name. The *documented but not shipped*
  half is now checked against the union of all distributions: a page may
  cross-reference a real command, and what that half is for is a name that
  ships nowhere.
- 2026-09-17 — Phase 3: the answer to its open question is that this file **is**
  under the guard. The exemption it allowed for — a check firing on a history
  section — did not apply, because the file had no history section; it had a
  fenced block presenting two skills removed in v3 as the live engine. It also
  gained a `## The review engine` section naming which surface owns the
  mechanism, the judgment, the page and the wait, plus the whole
  `spec-env review` verb list and the three sidecars. One mechanism was added:
  `<!-- history -->` exempts a marked paragraph from the negative half, with a
  test asserting an unmarked mention still fails.
