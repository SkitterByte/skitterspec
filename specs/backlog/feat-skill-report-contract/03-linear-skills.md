---
linear_issue_id: "SKS-194"
---

# Phase 3 — Retrofit the 6 Linear skills, extend the guard to all 17 ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the provider package's skills end the same way as the base package's,
and the contract test covers every shipped skill.

## Tasks

- [ ] Rewrite `## Report` in `spec-push`, `spec-status`, `spec-list`,
      `spec-claim`, `spec-sync`, `spec-linear-setup` against the contract.
- [ ] Decide, per skill, how the block relates to output the skill already
      renders. `spec-status` and `spec-list` print their own listings; the block
      is the verdict and the counts, the listing stays as the listing — it is not
      flattened into fields.
- [ ] Cover the states these skills actually reach: `⏸` for "no provider
      configured" or "Linear unreachable", `⚠️` for a partial push, and the
      drift report's "in sync" vs "would push N".
- [ ] Extend `assets-report-contract.test.js` to `packages/linear/assets/skills`
      so all 17 are covered, and assert the count so a new skill cannot be added
      without an ending.
- [ ] Check the rule ships with the provider distribution too: `build-dist.js`
      overlays `packages/linear/assets/rules` onto the common tree, so a
      `skitterspec-linear`-only install must still get `spec-reports.md`. Add a
      test if nothing asserts it.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The Linear skills are where `⏸` earns its place. "Linear is not connected" and
"the push failed half-way" are opposite facts about the tracker, and today both
arrive as a paragraph. `negative-checks.md` rule 4 is the same instinct pointed
at the report: an unreachable tracker is *cannot tell*, not *failed*.
