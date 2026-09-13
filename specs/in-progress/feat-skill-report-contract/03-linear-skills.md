---
linear_issue_id: "SKS-194"
---

# Phase 3 — Re-render the block as a table, then the 6 Linear skills ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the block renders as a table with the offer inside it, every one of
the 17 skills ends that way, and the contract test covers them all.

## Tasks — the re-render (decisions 2, 11, 12)

- [x] Rewrite the block in `packages/common/assets/rules/spec-reports.md`: a
      verdict **sentence**, then a two-column markdown table. Drop the aligned
      key-value list and the fenced block, and say why in the rule itself — the
      alignment only existed inside a fence, and a fence reads as code.
- [x] **Rename `Diff` to `Review`** in the field vocabulary. One row carries the
      counts, the page link and the offer; there is no separate offer row, and
      it is present only when there is a rendered page.
- [x] **Re-order the vocabulary** to decision 13: `Tracker` · `Why` · `Branch` ·
      `Spec` · `Cause` · `Built` · `Tests` · `Landed` · `Worktree` · `Review` ·
      `Follow-ups` · `Next`. `Follow-ups` is now "always present,
      second to last"; `Next` is always the final row. Re-order every skill's
      `**Fields:**` declaration to match — `assets-report-contract.test.js`
      already asserts the order, so it will name every one that is stale.
- [x] Make `Tracker` the **first** row, carrying the id linked where the spec has
      a url, and the spec's folder name beside it (decision 14). Phrase it **tracker-neutrally** — the rule ships in
      the tracker-free base and `compose.test.js` fails on a provider's name
      there — and say the row is absent when nothing is linked, rather than
      rendering an empty one.
- [x] Re-render all four worked examples, and the `❌` growth example, as tables.
- [x] Update the 11 common skills' `**Fields:**` declarations: `Diff` becomes
      `Review`, moved last, on the four that render a page (`spec-next`,
      `spec-bug`, `spec-hotfix`, `spec-diff`).
- [x] Rewrite `/spec-next` step 5, `/spec-bug` step 5b and `/spec-hotfix` step 6b:
      the offer is now the block's final **row**, not the paragraph after the
      block. Keep every reason it is last; change only where last is.
- [x] Rewrite `assets-offer-last.test.js` around the new anchor. It keeps its
      job — the offer is not buried, it is addressed to someone, it gates
      nothing — and it must still fail if a later edit moves the offer back
      above `Follow-ups` or out of the block.
- [x] Teach `assets-report-contract.test.js` the new order, and that `Review`
      may only appear last.

## Tasks — the Linear skills

- [x] Rewrite `## Report` in `spec-push`, `spec-status`, `spec-list`,
      `spec-claim`, `spec-sync`, `spec-linear-setup` against the contract.
- [x] Decide, per skill, how the block relates to output the skill already
      renders. `spec-status` and `spec-list` print their own listings; the block
      is the verdict and the counts, the listing stays as the listing — it is not
      flattened into fields.
- [x] Cover the states these skills actually reach: `⏸` for "no provider
      configured" or "Linear unreachable", `⚠️` for a partial push, and the
      drift report's "in sync" vs "would push N".
- [x] Extend `assets-report-contract.test.js` to `packages/linear/assets/skills`
      so all 17 are covered, and assert the count so a new skill cannot be added
      without an ending.
- [x] Check the rule ships with the provider distribution too: `build-dist.js`
      overlays `packages/linear/assets/rules` onto the common tree, so a
      `skitterspec-linear`-only install must still get `spec-reports.md`. Add a
      test if nothing asserts it.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The Linear skills are where `⏸` earns its place. "Linear is not connected" and
"the push failed half-way" are opposite facts about the tracker, and today both
arrive as a paragraph. `negative-checks.md` rule 4 is the same instinct pointed
at the report: an unreachable tracker is *cannot tell*, not *failed*.
