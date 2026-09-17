---
linear_issue_id: "SKS-313"
---

# Phase 3 — The developer-facing README ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `packages/common/README.md` describes the review engine a contributor
will actually meet, and is covered by the same guard.

## Tasks

- [x] Bring `packages/common/README.md`'s three review mentions up to what the
      engine does: the `spec-env review` verbs (`serve`, `wait`, `arm`, `gate`,
      `skip`, `waiting`, `--docs`, `--claim-since`), the sidecar files beside the
      page, and where each lives.
- [x] Say which surface owns what, since this is the file a contributor reads
      before changing any of it: the rules own the mechanism, the skills own the
      judgment, the engine owns the wait.
- [x] Bring it under phase 1's guard, or state plainly why not — it is not
      published to npm, so the set-equality check may be the wrong shape for a
      file that legitimately discusses dead commands in a history section.
- [x] **Stays-silent test** (rule 3): whichever way that goes, a deliberate
      mention of a removed command in a historical note must not fail the build.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Lowest priority of the three and still worth doing: this is the file that
explains the engine to whoever next changes it, and every wrong conclusion in
this area today came from a mechanism nobody had written down in one place.

The third task is a real question rather than a formality. A guard that fires on
a history section would be the same over-reach this spec is fixing, so the phase
is allowed to conclude that the answer is "not this file".

**The third task was a real question and the answer is "yes, this file too".**
The phase was allowed to conclude "not this file" if a guard would fire on a
history section — and it does not apply here, because this file had **no history
section**. What it had instead was a fenced block presenting `/spec-env` and
`/spec-env-down`, removed in v3, as *"the manual engine behind the
automation"* — two commands someone would copy and find missing. That is the
exact failure the guard exists for, so the file is held to the base set like any
other. It was also short by three commands (`/spec-diff`, `/spec-reviewed` and
the three slash commands) and still claimed to install **eight** skills.

**One mechanism had to be added for it: `<!-- history -->`.** Replacing that
block left one sentence worth keeping — *the `/spec-env` and `/spec-env-down`
skills were removed in v3* — which is precisely what a contributor reaching for
them wants to read. With no `## v3` section to sit in, the negative half had
nothing to exempt it by. So a paragraph carrying the marker is skipped, and a
test asserts the exemption is an **annotation rather than a loophole**: an
unmarked mention of the same phrase still fails, and marking one paragraph does
not exempt the next.
