---
linear_issue_id: "SKS-75"
---

# Phase 3 — Single-source shared blocks via common fragments ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** each near-identical block exists once in
`packages/common/assets/seams/`, filled into both distributions at build time;
composed output is unchanged in meaning.

## Tasks

- [x] Extend `scripts/build-dist.js` to load common fragments from
      `packages/common/assets/seams/` and merge them with provider fragments
      when composing (`scripts/compose.js` needs no new syntax — one merged
      fragment map). Refuse a name collision between common and provider
      fragments loudly.
- [x] Extract the Impact-map guidance block (verbatim ×3 in spec, spec-bug,
      spec-hotfix — the `<The concrete surfaces…>` boilerplate) into one
      fragment; keep the one-line type-specific tail ("A bug fix often changes
      no external surface…") local to each skill.
- [x] Extract the worktree provision/bootstrap/trust/`mv`-gotcha block shared by
      spec-bug §2 and spec-hotfix §3 into one fragment, parameterised only by
      the fork point wording ("main's last commit" vs "the tag") — keep
      spec-go's variant local, it genuinely differs (hand-off flow).
- [x] **Measured, then dropped.** These six are 25-34% similar, not duplicated:
      each names the bucket its own skill should look in first (backlog for
      spec-go, in-progress for spec-complete, any for spec-cancel/review) and
      spec-push/spec-status compress the whole thing to one line. Extracting
      would have destroyed a real per-skill distinction to save four lines.
- [x] **Measured, then dropped.** spec-complete §7 and spec-cancel §7 are 8.6%
      similar (61 vs 28 lines). They share a four-verb sequence and almost no
      wording — complete runs teardown automatically after a verified landing,
      cancel offers it for possibly-unlanded work. Nothing to single-source.
- [x] Verify the composed dist output against the pre-change output — the diff
      must be wording-neutral (whitespace/identical text only) unless a task
      above deliberately unified divergent wording; record any such unification
      in the Changelog.
- [x] Add compose tests: common+provider fragment merge, collision refusal, and
      the existing no-dangling-marker guarantee holding over common fragments.
- [x] Rebuild dists (`pnpm build`); run `pnpm test` — green before the phase is
      done.

## Notes

Build-time only: no installer change (init.js keeps installing a single
SKILL.md per skill), no runtime behaviour change. The win is single-source
maintenance — the review found three blocks already drifting apart.
