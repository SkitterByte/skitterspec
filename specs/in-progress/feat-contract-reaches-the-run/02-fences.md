---
linear_issue_id: "SKS-204"
---

# Phase 2 — Unfence the two prompts, state and guard the rule ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no skill tells the model to render a message to the reader as a code
block, the contract says so in words, and a new one fails a test.

## Tasks

- [ ] Rewrite `/spec-start` step 6's *"worktree ready … build phase 1 now?"*
      prompt as prose ending in a question. Keep what it does — state the
      worktree path, offer both endings, recommend building — and keep the
      recommendation, since the step's own text says to ask rather than decide.
- [ ] Rewrite `/spec-list` step 5's *"start one with: /spec-start <name>"*
      hand-off as a sentence.
- [ ] Add the rule to `packages/common/assets/rules/spec-reports.md`: a fenced
      block is for a command to run, code, or engine output quoted verbatim —
      never for a message addressed to the reader. Give the reason, which is the
      one this whole contract came from: a grey box is read as an artefact to
      skim, not as something someone is being asked.
- [ ] Write `packages/common/test/assets-fences.test.js`. For every shipped
      skill, classify each fenced block: **command** (a line beginning `git`,
      `skitterspec`, `npm`, `pnpm`, `node`, `npx`, `yarn`, `mkdir`, `cd`),
      **quoted output** (named in the allowlist with a one-line reason), or
      **reader-facing** — and fail on the third, naming skill and first line.
- [ ] Build the allowlist from what actually ships today, one entry per block
      with the reason it is legitimate: `/spec-linear-setup`'s JSON samples and
      `--stage` flags, `/spec-list`'s two engine-output samples,
      `/spec-sync`'s `apply --all` preview. Do not allowlist the two being fixed.
- [ ] Pair it with a stays-silent case: a command block, a JSON block and an
      allowlisted output block must all pass untouched. The guard accuses, so it
      needs a test proving it stays quiet on the 17 legitimate blocks as well as
      one proving it fires on the 2.
- [ ] Assert the allowlist is **not vacuous and not stale** — every entry names a
      skill that ships and a block that is still present, so a removed block
      leaves a dead entry that fails rather than silently widening the guard.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The classifier is a heuristic and will be wrong occasionally; the allowlist is
where being wrong gets recorded rather than argued. That is the point of pairing
it with a reason per entry — an allowlist of bare paths is indistinguishable from
a guard nobody maintains.

`/spec-start`'s prompt is the harder rewrite of the two: it currently uses the
block's alignment to show two options side by side, and prose has to carry that
without becoming a paragraph the reader skims.
