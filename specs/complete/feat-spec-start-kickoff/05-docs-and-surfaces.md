---
linear_issue_id: "SKS-153"
---

# Phase 5 — Docs, compose and shipped-surface guards ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the new shape is described where adopters read, and every shipped
surface carries it consistently.

## Tasks

- [x] Update `packages/common/assets/rules/spec-planning.md`: the isolation
      paragraph now describes both endings rather than the hand-off alone.
- [x] Update `packages/common/README.md` where it describes starting a spec.
- [x] Document `spec-env resolve`'s two new flags — in the CLI usage text and in
      `docs/index.html`, which is where the `spec-env` verbs are actually listed
      (`env.config.md` documents config keys, not verbs).
- [x] Rebuild the composed distributions (`node scripts/build-dist.js all`).
      The self-hosted `.claude/` install needed no resync — see the Notes.
- [x] Extend the assets tests so the new shape is guarded across all shipped
      surfaces, the way `33c6479` guarded the last one
      (`assets-kickoff-surfaces.test.js`).
- [x] Add the `MIGRATION.md` note — into the **pending** v19 / v13 entries, not
      a new major. See the Changelog.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

`scripts/docs-claims.test.js` and `scripts/skill-budget.test.js` both police this
kind of change — check them early rather than at the end, since a skill that has
grown past its budget is a rewrite, not a tweak.

Both were worth checking early, and both were quiet: `docs-claims` and
`skill-budget` passed throughout, so no skill outgrew its description budget.
`assets-emphasis` was the one that kept firing — four straddling bold spans
across the spec, every one of them mine.

**The `.claude/` install here is symlinks, not copies.** `scripts/dev-sync.js`
refuses in this repo because the worktree does not link back to itself, and it
does not need to: `.claude/rules/*` and `.claude/skills/*` point straight at
`packages/*/assets/`, so editing the source IS the resync.
`scripts/claude-links.test.js` guards those links. `dev-sync` is for a *consumer*
project that has the package installed.
