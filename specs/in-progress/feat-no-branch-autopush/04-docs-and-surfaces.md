---
linear_issue_id: "SKS-166"
---

# Phase 4 — Docs, migration and shipped-surface guards ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every surface describes a start that publishes nothing and a CLI verb
called `plan`, and an upgrader is told both.

## Tasks

- [x] Update `packages/common/assets/rules/spec-planning.md` wherever it implies
      the branch reaches the remote at provisioning.
- [x] Update `docs/linear.html` for the renamed verb, and `docs/index.html` if it
      describes the branch being pushed.
- [x] Add both changes to the **pending** v18 → v19 and v12 → v13 `MIGRATION.md`
      entries — they are written but unreleased, so this rides the same major
      (decision 9). The CLI rename is a breaking change and belongs under
      **Breaking change**, not a footnote.
- [x] Spell out in the migration what an upgrader will notice: spec branches stop
      appearing on the remote, and cancelling a spec with unpushed work now
      refuses until they publish or `--force`. Both are behaviour changes even
      though nothing was removed from their config.
- [x] Rebuild the composed distributions (`node scripts/build-dist.js all`). The
      self-hosted `.claude/` install is symlinked into `packages/*/assets/`, so it
      needs no resync — `dev-sync` is for consumer projects.
- [x] Extend the assets tests so the new shape is guarded across all shipped
      surfaces.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

Check `scripts/docs-claims.test.js`, `scripts/migration-guide.test.js` and
`scripts/skill-budget.test.js` early rather than at the end.

Compose in memory from the source when asserting on distribution output —
`packages/skitterspec*/assets/` is gitignored build output, and reading it makes
a test pass for whoever just ran a build and fail on a fresh clone.

**Finding: `spec-planning.md` needed no edit.** Its five `push` mentions are all
`/spec-push` the skill; nothing in it implied the branch reaches the remote at
provisioning. Recorded rather than left as an unticked box — the task was to
check, and the check came back clean. Same for `docs/index.html`, which makes no
such claim either. `docs/linear.html` was done in phase 3, where the
`docs-claims` guard forced it.

**The new guard found two claims the phase 2 sweep missed** —
`assets/core/env.config.md` and `src/env/config.js`, both explaining
`teardown.deleteRemoteBranch` in terms of a branch `/spec-start` had pushed. Both
now describe a branch the user published by hand, which is decision 5's reasoning
for keeping that prompt. This is the argument for the guard existing: a claim
that *explains* rather than *does* survives the behaviour change that falsifies
it, because nothing goes red.
