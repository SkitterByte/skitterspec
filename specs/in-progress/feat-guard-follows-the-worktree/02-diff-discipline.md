---
linear_issue_id: "SKS-216"
---

# Phase 2 — `/spec-diff`: the same discipline where it writes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the one step in `/spec-diff` that changes code takes the same
discipline and the same leak guard as `/spec-next`, without acquiring a
precondition.

## Tasks

- [x] In §2.3 — *"on the go-ahead, work only the commented files"* — add the
      discipline, conditioned the same way as phase 1: resolve the spec's
      worktree, compare it against cwd, and when they differ write absolute paths
      and `cd`-prefix every command, typecheck and tests included. Resolution by
      **name argument** is §1's first rule, so this is the ordinary case here,
      not an edge one.
- [x] Record the baseline with `--record-primary` **before the first edit**, and
      run `--assert-primary-clean` **after the changes and before the re-render**
      in §2.4 — the same window `/spec-next` uses, for the same reason: nothing
      is reported done before it is known to be in the right tree.
- [x] Carry §4b's three verdicts across intact — `clean` carries on, `leaked`
      relays the engine's message unchanged without guessing or deleting,
      `cannot tell` says so in one line and carries on. Do not re-word the
      engine's output.
- [x] **Do not touch §3, "Gate it on nothing".** State in the new text that this
      is a write discipline and not a precondition: it changes how the skill
      writes, never whether it runs. A later edit reading it as a gate would undo
      the rule §3 exists to protect.
- [x] Leave the read-only paths untouched. Rendering, serving and `--notes`
      intake write nothing into a checkout, so none of them acquire a baseline,
      an assertion or a condition to evaluate.
- [x] Add assertions to `packages/common/test/assets-spec-diff.test.js`: the
      discipline is present in §2.3 and conditioned on the worktree, the baseline
      precedes the edits and the assertion precedes the re-render (index
      comparisons, as `assets-spec-next-worktree.test.js` does it), and the
      guessing/deleting ban survives the copy across.
- [x] Add the **stays-silent** cases: standing in the spec's own worktree leaves
      the step inert, and §3's gate-on-nothing rule is still asserted intact
      afterwards — that second one is green on both sides by design, which is
      what makes it the guard rather than the repro.
- [x] Run `pnpm test` at the repo root — green before the phase is done, then
      `pnpm build` to refresh the composed copy. **2126 passed, 0 failed.**

## Notes

`/spec-diff` is the wider exposure of the two. `/spec-next` reaches a foreign
tree only via rung 4 or an explicit flag; `/spec-diff` reaches one by its
**first** resolution rule, and today it has no guard whatsoever — so the phase
ordering here is by blast radius, not by severity.
