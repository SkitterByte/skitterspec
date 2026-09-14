---
linear_issue_id: "SKS-232"
---

# Phase 2 — Targeting, and the relocation guard ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-reviewed <name|id>` picks up another spec's pass, and never acts
on it from the wrong tree.

## Tasks

- [ ] Accept a **spec name** and act on that spec rather than the resolved one.
- [ ] Accept a **tracker id** as a provider seam: resolve it through the
      provider's `linked` listing (`spec-sync linked --json` gives
      `{ spec, bucket, identifier }`). With no provider installed an id resolves
      to nothing and says so — the base knows nothing about tracker ids and must
      not guess that a `SKS-227`-shaped string is one.
- [ ] Compare the target's worktree against where the session stands, resolving
      both paths first so a symlinked or trailing-slash spelling does not read as
      two trees (the comparison `/spec-next` already documents).
- [ ] **Same tree — carry on**, with nothing said. This is the ordinary case and a
      line about it would be narration.
- [ ] **Different tree — ask, then relocate.** Name both, say why it matters (an
      `approve` commits and `changes` edits, and both must land in that spec's
      worktree), and move with a plain `cd` on a yes — the mechanism `/spec-start`
      already uses, deliberately not a tool call.
- [ ] **On a no, stop without claiming.** A pass claimed here and acted on there
      is the split this guard exists to prevent; claiming first and then refusing
      to move would spend the code for nothing.
- [ ] **A target with no worktree is a refusal**, naming it: there is nowhere for
      an approve to commit. Suggest `/spec-start <name>` and stop.
- [ ] Confirm the move landed before acting — `skitterspec spec-env resolve` with
      no argument must name the target (`.claude/rules/negative-checks.md` rule 1:
      ask for a positive signal rather than reading silence as success).
- [ ] Tests: the prose pins the ask-then-relocate rule, the no-worktree refusal,
      and that a "no" claims nothing; a guard that it does not simply act from the
      wrong tree.
- [ ] **Stays silent:** a bare invocation, and a named one that resolves to the
      tree you are already in, both say nothing about relocation
      (`.claude/rules/negative-checks.md` rule 3).
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Refusing unless you are on `main` was the other candidate and is worse: it bans
a legitimate case — standing in one spec, picking up another's approval — while
*still* leaving the work to be done in a tree you are not in. The relocation is
needed either way, so the guard may as well be the relocation.
