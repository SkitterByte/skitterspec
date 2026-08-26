# Phase 1 — `/spec` feature template + test ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The `/spec` feature template emits a `## Impact` section on
`00-overview.md`, and a test proves it can't regress.

## Tasks

- [x] In `packages/common/assets/skills/spec/SKILL.md`, add the `## Impact`
      block to the `00-overview.md` template — placed **after `## Solution
      overview`, before `## Phases`** — using the table shape and the
      guided-but-open surface-vocabulary comment from the Solution overview.
- [x] Add the "required section, rows only for real changes; one-liner when no
      external surface" rule to the template comment.
- [x] In Phase A/B prose, note the Impact table is derived from Phase A items 3
      (Affected areas) & 5 (Data/API impact) — a structured place to record what
      those already surface, not new grilling — and that `Detail` stays terse
      (names/signatures, not sentences).
- [x] In `packages/common/test/assets.test.js`, add a test asserting the `spec`
      SKILL.md contains a `## Impact` heading and the `Surface | Change | Detail`
      table header. Run `npm test` (`node --test`) — green before the phase is
      done.

## Notes

Source of truth is `packages/common/assets/**` only; dist + the repo-local
`.claude/skills/spec` symlink follow automatically. Do not hand-edit dist.

The test is parametrised over an `IMPACT_TEMPLATE_SKILLS` array (currently
`['spec']`) — Phase 2 extends that array to `spec-bug` + `spec-hotfix` rather
than adding new test blocks.
