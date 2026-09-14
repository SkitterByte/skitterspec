---
linear_issue_id: "SKS-236"
---

# Phase 3 — Routing, and the words ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a claimed `commit-continue` commits and then builds the next phase,
`discuss` opens a conversation instead of ending one, and every surface adopters
read describes the four.

## Tasks

- [x] Route `commit-continue` in `/spec-diff` §2a: the same hand-off to
      `review.commitWith`, then **`/spec-next`**. On a failed commit there is no
      continue — the chain stops where it broke, and says where.
- [x] Stop at the next phase: when there is none, say the spec has no unfinished
      phase left and stop. **Never `/spec-complete`** — landing and teardown must
      not fall out of a button that said *continue* (Decision 4).
- [x] Rewrite `discuss`: it means **"ask me what's up"**. Report what was read,
      then open the conversation — a question, not a summary that ends in
      silence. It is also what an absent verdict means, so the wording has to
      work for a pass that chose nothing.
- [x] Keep `changes` exactly as it is: it is the go-ahead, and this spec does not
      touch it beyond the vocabulary around it.
- [x] Carry the routing into **`/spec-reviewed`** if that spec has landed; if it
      has not, point its phase 1 at this routing rather than duplicating it, so
      the two cannot drift. Say which happened in the Changelog.
- [x] Update `spec-planning.md`, the CLAUDE.md section, `env.config.md` and the
      docs site: four verdicts, `commitWith` without `none`, and the sentence
      that explains the rename — a review is the guard before an action, so the
      verdict names the action.
- [x] Record the overturned Non-goal where a reader will meet it: the chaining
      ban was right about *automatic* chaining and wrong to catch a chosen one.
      Cite it rather than quietly contradicting it.
- [x] Keep the `/spec-diff` description inside the 500-char budget.
- [x] Tests: the skill prose pins the commit-then-next routing, the stop at the
      last phase, the no-complete rule, and `discuss` as a question; the
      docs-claims guard covers `commitWith` losing `none`.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The interesting test is the one asserting **`continue` never completes**. It is
the single place where a button on a phone could reach a destructive action, and
the distance between "build the next phase" and "land the branch and delete the
worktree" is one skill name.
