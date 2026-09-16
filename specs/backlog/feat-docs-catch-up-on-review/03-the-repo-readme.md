---
linear_issue_id: "SKS-313"
---

# Phase 3 — The developer-facing README ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `packages/common/README.md` describes the review engine a contributor
will actually meet, and is covered by the same guard.

## Tasks

- [ ] Bring `packages/common/README.md`'s three review mentions up to what the
      engine does: the `spec-env review` verbs (`serve`, `wait`, `arm`, `gate`,
      `skip`, `waiting`, `--docs`, `--claim-since`), the sidecar files beside the
      page, and where each lives.
- [ ] Say which surface owns what, since this is the file a contributor reads
      before changing any of it: the rules own the mechanism, the skills own the
      judgment, the engine owns the wait.
- [ ] Bring it under phase 1's guard, or state plainly why not — it is not
      published to npm, so the set-equality check may be the wrong shape for a
      file that legitimately discusses dead commands in a history section.
- [ ] **Stays-silent test** (rule 3): whichever way that goes, a deliberate
      mention of a removed command in a historical note must not fail the build.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Lowest priority of the three and still worth doing: this is the file that
explains the engine to whoever next changes it, and every wrong conclusion in
this area today came from a mechanism nobody had written down in one place.

The third task is a real question rather than a formality. A guard that fires on
a history section would be the same over-reach this spec is fixing, so the phase
is allowed to conclude that the answer is "not this file".
