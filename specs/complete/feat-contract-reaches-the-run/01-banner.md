---
linear_issue_id: "SKS-203"
---

# Phase 1 — The banner, on all 17 skills ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every `SKILL.md` states the silence rule and points at the contract
**before** its first working section, and a test proves it rather than a reader
noticing its absence three weeks later.

## Tasks

- [x] Write the banner once, as a blockquote placed directly under each skill's
      h1 and above its first `##` section. Two sentences: stay silent while this
      runs (with the two exceptions), and read
      `.claude/rules/spec-reports.md` before reporting.
- [x] Apply it to all 17 — the 11 in `packages/common/assets/skills` and the 6
      in `packages/linear/assets/skills`. Identical text everywhere; a per-skill
      variation is a thing to keep in step for no gain.
- [x] Extend `assets-report-contract.test.js`: every skill in its list carries
      the banner, and carries it **before** its first `## ` heading. Position is
      the whole point of the phase, so assert the position rather than the
      presence.
- [x] Assert the banner text is **identical** across all 17, comparing them to
      each other rather than to a copy in the test — a literal in the test is a
      second source of truth that drifts the first time the wording changes.
- [x] Pair it with a stays-silent case (`.claude/rules/negative-checks.md`
      rule 3): a skill whose banner sits under a frontmatter block, or that has
      extra prose between banner and first section, must still pass. Neither is
      a fault, and a position check written too tightly turns ordinary formatting
      into a failure.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The banner duplicates two lines seventeen times, and that is the trade decision 1
accepted: placement cannot be achieved by reference, because the thing being
fixed is that the reference is read too late.

It must not grow. Every sentence added here is paid on every skill invocation, and
the reason this is a pointer rather than a copy of the block (decision 2) is the
same reason it should stay two sentences long.
