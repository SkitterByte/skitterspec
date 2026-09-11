---
linear_issue_id: "SKS-150"
---

# Phase 2 — Engine: primary-checkout baseline + assertion ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine can record what the primary checkout looked like before a
remote build and then report, deterministically, whether anything new was
written into it.

## Tasks

- [ ] Add `--record-primary` to `spec-env resolve`: capture
      `git status --porcelain` for the primary checkout (via the existing
      `resolvePrimaryCheckout`) into `.spec-env/building.json` alongside the
      spec slug and worktree path.
- [ ] Add `--assert-primary-clean`: re-read the primary checkout's porcelain
      status, subtract the recorded baseline, and exit non-zero naming only the
      paths that appeared since — with the worktree path in the message, so the
      fix is obvious.
- [ ] **Missing or mismatched baseline → say so and exit 0.** The check cannot
      tell, and cannot-tell routes to inaction (`negative-checks.md` rule 4).
- [ ] Confirm `.spec-env/` is gitignored, so the baseline file and the registry
      never appear in the status this check reads.
- [ ] Write the blind-spot comment beside the check, naming what would fool it
      (a baseline from a different spec; a primary checkout that was already
      dirty; work staged rather than committed in the worktree).
- [ ] Add/extend tests covering this phase; run the project's typecheck and
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
