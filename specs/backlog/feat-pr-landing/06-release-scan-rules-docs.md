---
github_issue_id: "#112"
---

# Phase 6 — release-scan hardening + rules, docs, report vocabulary ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the release scan survives non-linear history, and every rule, doc and
report that says "fast-forward" now tells the truth in both modes.

## Tasks

- [ ] `spec-sync released`: add `--no-merges` to every provider's `git log`
      call (github, linear, jira, azure-boards `cli-sync.js`) — safe in trunk
      mode where merge commits do not exist. Merge commits therefore stop
      counting as `unreferenced` gaps.
- [ ] Document the squash policy in `commit-trailers.md` and each provider's
      docs page: squash merges keep `Refs:` only when the host's squash message
      includes commit bodies (name the setting per host); otherwise put the ref
      in the PR description and accept that `released` reports the squashed
      commit by its PR, not per-commit. Closing keywords stay banned; `AB#123`
      linking tokens are the host's own mechanism and are neither required nor
      forbidden.
- [ ] `spec-reports.md`: `Landed` row vocabulary gains `PR #N opened` /
      `PR #N (draft) updated` / `PR #N merged`; the banner and `Next` examples
      stay as they are (the wait contract is untouched by this spec).
- [ ] `spec-planning.md`: amend the landing paragraphs ("rebase +
      fast-forward", "/spec lands by a fast-forward", "`main` is where work
      lands") to state both strategies and which config picks one;
      `mainguard.js`'s rationale comment likewise (behaviour unchanged).
- [ ] `env.config.md`: full field reference for `land.*`, with the Azure and
      GitHub CLI prerequisites and the cannot-tell behaviour spelled out.
- [ ] `docs/` pages listed in this spec's `Docs:` header re-read and updated;
      bump each touched page's `verified:` in the same commit
      (`docs-freshness` convention).
- [ ] Tests: released-scan fixtures with merge-commit and squash histories
      (trailer kept / lost / in-PR-body), each asserting counts — plus the
      stays-silent test: a linear trunk history reports identically before and
      after `--no-merges`.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

This phase is deliberately last: wording follows behaviour. The
`docs-freshness impact` run at `/spec-complete` is the check that this phase
was not skipped.
