---
linear_issue_id: "SKS-150"
---

# Phase 2 — Engine: primary-checkout baseline + assertion ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine can record what the primary checkout looked like before a
remote build and then report, deterministically, whether anything new was
written into it.

## Tasks

- [x] Add `--record-primary` to `spec-env resolve`: capture what the primary
      checkout has gained (via the existing `resolvePrimaryCheckout`) into
      `.spec-env/building.json` alongside the spec slug and worktree path.
      Content-based, not `git status --porcelain` — see the Changelog.
- [x] Add `--assert-primary-clean`: re-read the primary checkout, subtract the
      recorded baseline, and exit non-zero naming only the paths that appeared
      since — with the worktree path in the message, so the fix is obvious.
- [x] **Missing or mismatched baseline → say so and exit 0.** The check cannot
      tell, and cannot-tell routes to inaction (`negative-checks.md` rule 4).
      Covers absent, unreadable, another spec's, and another worktree's.
- [x] Confirm `.spec-env/` is gitignored, so the baseline file and the registry
      never appear in the status this check reads (`.gitignore:17`).
- [x] Write the blind-spot comment beside the check, naming what would fool it
      (work committed in the primary; a write to a gitignored path; a path
      already dirty at record time).
- [x] Phrase the accusation as an observation, not an attribution — the guard
      sees paths appear, and cannot know who wrote them.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

This check **accuses**, so `.claude/rules/negative-checks.md` applies in full.
It needs both directions:

- **Fires:** a file written into the primary checkout during the build is named,
  and the exit is non-zero.
- **Stays silent** (rule 3 — one test per healthy-but-unusual input): a clean
  primary; a primary dirty with the *same* paths as the baseline (someone
  editing something unrelated in another window); a missing baseline; a
  `checkout`-mode repo where there is no second tree at all.

Both directions are covered, in two files: `env-building.test.js` for the pure
comparison and `cli-spec-env-primary-guard.test.js` against real git, a real
worktree and real writes. The stays-silent set came out at seven — clean, a
pre-dirty path, work done in the worktree, an absent baseline, an unreadable
one, another spec's, another worktree's, and checkout mode.
