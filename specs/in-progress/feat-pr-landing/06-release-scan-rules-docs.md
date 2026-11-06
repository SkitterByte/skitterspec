---
github_issue_id: "#112"
---

# Phase 6 — release-scan hardening + rules, docs, report vocabulary ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the release scan survives non-linear history, and every rule, doc and
report that says "fast-forward" now tells the truth in both modes.

## Tasks

- [x] `spec-sync released`: ~~`--no-merges`~~ **replaced during the build** —
      a linear-stays-silent test proved `--no-merges` lossy: a hand merge is
      where a ticket's only trailer sometimes lives, and skipping merges drops
      that ticket from the release. Instead `%P` rides with the sha in every
      provider's log format, `ticketsInRange` reads merge commits' trailers as
      ever but counts a **trailer-less** merge as `merges` (transport), never
      `unreferenced`; the report gains the field only when a caller supplies
      parent info, so the old shape is untouched. All four providers + their
      printers.
- [x] Merge-style coping documented (never a required style) in all four
      providers' `commit-trailers.md` (new "Merge styles, and which range still
      holds the trailers" section) and each provider's docs page: merge commits
      survive with transport counting; squashed feature PRs survive when the
      squash message keeps commit bodies, every `Refs:` line in one body
      counting (`refsInBody` already did — pinned by test); a squashed
      integration→release merge loses attribution by construction, so the doc
      points `released <range>` at the integration range. Closing keywords stay
      banned; `AB#123` tokens neither required nor forbidden.
- [x] `spec-reports.md`: `Landed` row vocabulary gains the PR forms including
      `held — not pushed`; banner and `Next` untouched.
- [x] `spec-planning.md` table row states both lanes; `mainguard.js` rationale
      gains the PR-mode paragraph (behaviour unchanged); the guard test pinning
      the old row wording updated to pin both lanes.
- [x] `env.config.md`: full `land.*` field reference (strategy/remote/draft/
      specDocs, CLI prerequisites, cannot-tell behaviour); `deleteRemoteBranch`
      prose updated for consent-gated pushes and host auto-delete.
- [x] All seven flagged `docs/` pages re-read and updated (reference, review,
      index, github, azure-boards, jira, linear) with `verified:` bumped;
      `docs-freshness impact main` now flags nothing.
- [x] Tests: merge-commit history (branch trailers count, trailer-less merge =
      transport with `merges: 1`), trailer-carrying merge keeps its ticket,
      squashed multi-`Refs:` body counts every ref (CLI + pure), linear's
      stays-silent merge test green again after the pivot.
- [x] Run `pnpm test` — green (4303 pass) · dist build green.

## Notes

This phase is deliberately last: wording follows behaviour. The
`docs-freshness impact` run at `/spec-complete` is the check that this phase
was not skipped.
