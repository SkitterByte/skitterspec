---
linear_issue_id: "SKS-331"
---

# Phase 2 — Wire preserve into the three adoption paths ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec`, `/spec-bug` and `/spec-hotfix` preserve the original before the
linking push replaces it, and stop telling the reader that Linear's history is
where their words went.

## Tasks

- [ ] In `packages/common/assets/skills/spec/SKILL.md`, add a preserve step to
      **Adopting the issue**, ordered explicitly **before** the linking push in
      Phase E — the ordering is the whole correctness condition, so say why.
- [ ] Replace the claim that "Linear keeps the original in the issue's history"
      with what is now true: the original is quoted in `## Problem` and preserved
      verbatim as a comment on the issue.
- [ ] Make the same two edits in `packages/common/assets/skills/spec-bug/SKILL.md`
      and `packages/common/assets/skills/spec-hotfix/SKILL.md`, where adoption
      happens at their steps 4 and 5 respectively.
- [ ] Say in the finish-up wording that the description will be replaced **and**
      that the original is preserved as a comment, so the reader learns it from
      the run rather than from the ticket.
- [ ] Extend `packages/linear/test/assets.test.js` (and the common package's
      asset test if it has one) to assert each of the three skills names
      `spec-sync preserve` and orders it before the push.
- [ ] Document the verb and `intake.preserveOriginal` in
      `specs/.core/linear.config.md` and the provider's own docs.
- [ ] Run `node --test` from the repo root — green before the phase is done.

## Notes

`/spec-hotfix` mines the issue for a version string and `/spec-bug` treats the
body as repro material — both already read the description at intake, so the
preserve call adds no read on the MCP path.
