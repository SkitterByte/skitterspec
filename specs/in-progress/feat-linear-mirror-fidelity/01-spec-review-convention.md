# Phase 1 — Document the H1 status convention in `/spec-review` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-review` tells the author that a phase file's status lives in its
H1 emoji, so migrating a legacy spec can't silently produce backlog phases;
proven by the assets test that guards skill content.

## Tasks

- [ ] In `packages/common/assets/skills/spec-review/SKILL.md` §4 "Update the
      spec", state the convention: a phase file's status is the `⬜`/`🔄`/`✅`
      on its **H1**, mirrored in the `> **Status:**` line and the overview
      phase-index row. Match `/spec-go`'s wording (SKILL.md:154–172).
- [ ] Call out the legacy-migration path explicitly — when `/spec-review`
      converts a bare `<name>.md` or an inline-phase overview into `0N-*.md`
      files, each new file's H1 must carry the emoji.
- [ ] Note that a provider reads the H1 (link to `linear.config.md`'s
      "Spec → Issue, phases → sub-issues") so the cost of getting it wrong is
      concrete, not stylistic.
- [ ] Extend `packages/linear/test/assets.test.js` (or add a `common` asset test)
      asserting the `/spec-review` skill body mentions the phase-heading emoji —
      a regression guard so the convention can't silently drop out again.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

`.claude/skills/spec-review` is a symlink to the `common` asset, so editing the
asset updates the dogfood copy in place. `packages/skitterspec*/assets/` is
gitignored and recomposed by `scripts/build-dist.js` — nothing to commit there.

This phase is deliberately first and standalone: it is the whole fix for the
reported failure. Phases 2–4 are hardening and ergonomics.
