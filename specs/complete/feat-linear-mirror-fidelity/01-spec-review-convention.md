---
linear_issue_id: "SKS-23"
---

# Phase 1 — Document the H1 status convention in `/spec-review` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-review` tells the author that a phase file's status lives in its
H1 emoji, so migrating a legacy spec can't silently produce backlog phases;
proven by the assets test that guards skill content.

## Tasks

- [x] In `packages/common/assets/skills/spec-review/SKILL.md` §4 "Update the
      spec", state the convention: a phase file's status is the `⬜`/`🔄`/`✅`
      on its **H1**, mirrored in the `> **Status:**` line and the overview
      phase-index row. Match `/spec-go`'s wording (SKILL.md:154–172).
- [x] Call out the legacy-migration path explicitly — when `/spec-review`
      converts a bare `<name>.md` or an inline-phase overview into `0N-*.md`
      files, each new file's H1 must carry the emoji.
- [x] Note that a provider reads the H1 (link to `linear.config.md`'s
      "Spec → Issue, phases → sub-issues") so the cost of getting it wrong is
      concrete, not stylistic.
- [x] Extend `packages/linear/test/assets.test.js` (or add a `common` asset test)
      asserting the `/spec-review` skill body mentions the phase-heading emoji —
      a regression guard so the convention can't silently drop out again.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

**Deviation — no provider link.** The third task said to link
`linear.config.md`'s "Spec → Issue, phases → sub-issues" section so the cost is
concrete. That would have broken the tracker-free base: `packages/common/assets`
contains **zero** mentions of Linear, and the base distribution ships
`/spec-review` with no provider installed. The passage instead says "a ticketing
provider projects that emoji as the phase's state in the tracker" — generic, and
consistent with how `spec-planning.md` already describes providers.

**The guard was verified to bite.** Reverting the `SKILL.md` edit and re-running
`packages/common/test/assets.test.js` fails both new tests; restoring it passes.
A regression guard that passes against the un-fixed content would be worthless.

`/spec-go` is covered by the same guard, so neither skill can lose the
convention silently.

`.claude/skills/spec-review` is a symlink to the `common` asset, so editing the
asset updates the dogfood copy in place. `packages/skitterspec*/assets/` is
gitignored and recomposed by `scripts/build-dist.js` — nothing to commit there.

This phase is deliberately first and standalone: it is the whole fix for the
reported failure. Phases 2–4 are hardening and ergonomics.
