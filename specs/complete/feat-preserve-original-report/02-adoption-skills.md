---
linear_issue_id: "SKS-331"
---

# Phase 2 — Wire preserve into the three adoption paths ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec`, `/spec-bug` and `/spec-hotfix` preserve the original before the
linking push replaces it, and stop telling the reader that Linear's history is
where their words went.

## Tasks

- [x] In `packages/linear/assets/seams/spec-tracker-intake.md`, add a preserve
      step to **Adopting the issue**, ordered explicitly **before** the linking
      push — the ordering is the whole correctness condition, so say why.
- [x] Replace the claim that "Linear keeps the original in the issue's history"
      with what is now true: the original is quoted in `## Problem` and preserved
      verbatim as a comment on the issue.
- [x] ~~Make the same two edits in the bug and hotfix skills.~~ Not needed: one
      seam fragment already serves all three, so the edit above covers them.
- [x] Say in the finish-up wording that the description will be replaced **and**
      that the original is preserved as a comment, so the reader learns it from
      the run rather than from the ticket.
- [x] Extend `packages/linear/test/assets.test.js` (and the common package's
      asset test if it has one) to assert each of the three skills names
      `spec-sync preserve` and orders it before the push.
- [x] Document the verb and `intake.preserveOriginal` in
      `specs/.core/linear.config.md` and the provider's own docs.
- [x] Run `node --test` from the repo root — green before the phase is done.

## Notes

`/spec-hotfix` mines the issue for a version string and `/spec-bug` treats the
body as repro material — both already read the description at intake, so the
preserve call adds no read on the MCP path.

**Two things this phase found that the spec had wrong**, both recorded in the
overview Changelog. The adoption prose does not live in three skill files: it is
**one seam fragment**, `packages/linear/assets/seams/spec-tracker-intake.md`,
injected into all three when the distribution is composed
(`packages/skitterspec-linear/assets/` is a build output and gitignored). So the
"same two edits in three files" task collapsed into one edit — and the risk the
task existed to cover, three copies drifting apart, does not exist here.

And the stale history claim had **a second copy** in
`assets/core/linear.config.md`, which the phase plan did not know about. An
existing asset test pinned that claim, so removing it turned the test red — which
is the repo catching the drift rather than the author remembering to.
