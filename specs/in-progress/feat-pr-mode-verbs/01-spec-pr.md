---
github_issue_id: "#331"
---

# Phase 1 — `/spec-pr`, and `/spec-complete` as the post-merge finish ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** in PR mode one verb shares and readies the PR and `/spec-complete`
runs once, after the merge — proven by skill-asset tests and an integrate
plan test.

## Tasks

- [x] Add `assets/skills/spec-pr/SKILL.md`: any phase not ✅ → draft (from
      `spec-to-main` §4b); all ✅ → disposition pass, consent naming
      `<remote>/<base>`, `integrate --push`, ready, `specDocs: "branch"`
      bucket move and `--hold-state` (from `spec-complete` §6-pr run 1)
- [x] ~~Refuse `/spec-pr` in ff mode~~ — superseded: it passes `--strategy pr`
      instead (Changelog 2026-11-26)
- [x] Reduce `spec-complete` §6-pr to the post-merge finish; pre-merge →
      `⏸`, naming the PR and `/spec-pr`, nothing edited
- [x] Point autonomous `--then pr` and the final page's `Open PR` at the
      `/spec-pr` ready path (`spec-next/autonomous.md`, `spec-diff`)
- [x] Reproduce LSC's "spec-complete did not push": a test of the PR-mode
      ready plan under `baseBranchPattern` + `specDocs: "branch"`; fix a
      cause found, else record it in the Changelog
- [x] Recognise a squash/rebase merge as landed: `integrate` asks the host
      whether the PR merged at this HEAD (`mergedAtHead`, `env/host.js`)
- [x] Add/extend tests (asset tests after `pnpm build`, integrate plan
      tests); `pnpm build && pnpm test` green
