---
linear_issue_id: "SKS-75"
---

# Phase 3 — Single-source shared blocks via common fragments ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** each near-identical block exists once in
`packages/common/assets/seams/`, filled into both distributions at build time;
composed output is unchanged in meaning.

## Tasks

- [ ] Extend `scripts/build-dist.js` to load common fragments from
      `packages/common/assets/seams/` and merge them with provider fragments
      when composing (`scripts/compose.js` needs no new syntax — one merged
      fragment map). Refuse a name collision between common and provider
      fragments loudly.
- [ ] Extract the Impact-map guidance block (verbatim ×3 in spec, spec-bug,
      spec-hotfix — the `<The concrete surfaces…>` boilerplate) into one
      fragment; keep the one-line type-specific tail ("A bug fix often changes
      no external surface…") local to each skill.
- [ ] Extract the worktree provision/bootstrap/trust/`mv`-gotcha block shared by
      spec-bug §2 and spec-hotfix §3 into one fragment, parameterised only by
      the fork point wording ("main's last commit" vs "the tag") — keep
      spec-go's variant local, it genuinely differs (hand-off flow).
- [ ] Extract the "Identify the target spec" block (×6: spec-go, spec-complete,
      spec-cancel, spec-review, spec-push, spec-status) into one fragment.
- [ ] Extract the teardown sub-steps (connect main → dev down → down → prune)
      shared by spec-complete §7 and spec-cancel §7; the auto-vs-offer framing
      and remote-branch prose stay local.
- [ ] Verify the composed dist output against the pre-change output — the diff
      must be wording-neutral (whitespace/identical text only) unless a task
      above deliberately unified divergent wording; record any such unification
      in the Changelog.
- [ ] Add compose tests: common+provider fragment merge, collision refusal, and
      the existing no-dangling-marker guarantee holding over common fragments.
- [ ] Rebuild dists (`pnpm build`); run `pnpm test` — green before the phase is
      done.

## Notes

Build-time only: no installer change (init.js keeps installing a single
SKILL.md per skill), no runtime behaviour change. The win is single-source
maintenance — the review found three blocks already drifting apart.
