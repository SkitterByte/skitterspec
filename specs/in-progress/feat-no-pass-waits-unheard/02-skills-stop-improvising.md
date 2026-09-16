---
linear_issue_id: "SKS-291"
---

# Phase 2 — The skills stop improvising one ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every skill that waits calls phase 1's command, and no document leaves
the agent to invent a loop — pinned by a guard test, as this repo pins every
other rule that lives in skill prose.

## Tasks

- [ ] `/spec-next` §5 ("Then wait for the verdict, where the harness can"):
      replace the description of a watch with the command. Run
      `spec-env review wait <spec> --since <t>` in the background, end the turn,
      and on waking claim with `--claim-since <t>`.
- [ ] `/spec-bug` §5b and `/spec-diff` §4b: point at `/spec-next` §5 rather than
      restating it. Two copies of a waiting rule is how the two come to disagree.
- [ ] Keep *"where the harness cannot watch, the turn ending is the wait"*
      exactly as it is. That path is untouched by this spec and a guard that
      caught it would accuse every such harness of a bug it does not have.
- [ ] `.claude/rules/spec-reports.md`, where the banner's *"I'm holding here
      until you send a verdict"* is defined: say the sentence is only true for as
      long as the wait is actually running, and that the wait is the engine's —
      so the promise has something behind it rather than an improvisation.
- [ ] **Say what a hand-rolled watcher costs**, once, where the rule is stated:
      it fails silently, and a broken one is indistinguishable from a patient
      one. Name the zsh `[ "$x" \> "$y" ]` case as the example — a rule with the
      incident attached is the shape every other rule in this repo takes.
- [ ] Guard test (`packages/common/test/assets-verdict-wait.test.js`): assert
      each document names `spec-env review wait`, and that none of them describes
      composing a loop or gives the wait a duration of its own.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This phase is prose, and prose alone is what failed. It is worth doing anyway
because phase 1 gives it something to point at: the rule is now *"call this"*
rather than *"be careful"*, which is a rule a test can check and a reader can
follow.
