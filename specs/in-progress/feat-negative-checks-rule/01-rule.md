# Phase 1 — Write and ship the rule ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `negative-checks.md` ships with the base and installs into a consumer's
`.claude/rules/`, proven by the asset suite that already walks every shipped rule.

## Tasks

- [x] Add `packages/common/assets/rules/negative-checks.md`. Keep it short — four
      points, each with the incident that earned it, in the register of
      `spec-planning.md`.
- [x] State the four: prefer a positive signal to an absence; name what would
      blind the lookup, beside the check; pair every accusation with a
      stays-silent test; bias the unknown case toward inaction.
- [x] Cite the in-repo example of the correct shape — `managedState`
      (`packages/common/src/init.js:148`) returning `customized` for an unknown
      hash, so resync keeps the file rather than clobbering it.
- [x] Cite the three real incidents by name so the rule reads as earned rather
      than invented: the archived-issue trap, the npm registry lag, and
      `bug-scaffold-empty-buckets`.
- [x] Confirm it installs with no manifest edit — `listRules()`
      (`packages/common/src/init.js:26`) discovers the directory.
- [x] Symlink it into this repo's `.claude/rules/` beside the other two, so the
      repo governs itself by the rule it ships.
- [x] Verify the existing asset suite covers it (`packages/common/test/assets.test.js`
      walks `assets/rules`); add a case asserting an installed project gets the
      rule, alongside the existing install assertions.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

The rule ships, so it is a product surface: written for someone else's codebase,
not just this one. Avoid skitterspec-specific jargon in the rule text — the
incidents are illustrations, not prerequisites.

Keep it to one screen. A rule nobody finishes reading changes nothing.
