# Phase 1 — Delete a merged branch that is ahead of its remote ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** teardown deletes the branch of a landed spec instead of refusing it,
proven by a test at the exact shape `/spec-go` leaves behind — merged into base,
ahead of `origin/<branch>`.

## Tasks

- [x] In `planDown` (`packages/common/src/env/teardown.js`), emit `git branch -D`
      when `worktreeState.merged` is true, alongside the existing `tagLanded`
      case; keep `-d` for every other path.
- [x] Rewrite the comment above it: `-d`'s refusal is about the branch being
      ahead of its **upstream ref**, which is a different question from whether
      the commits are recoverable. `merged` (ancestor of base) already answers
      the second, and is what makes `-D` safe here.
- [x] Confirm the forced teardown of a genuinely unmerged branch still emits
      `-d`, so it fails loudly rather than destroying unlanded commits.
- [x] Rewrite `branch delete is -d (merged-only), never -D`
      (`packages/common/test/env-teardown.test.js:170`) — it asserts the exact
      opposite of the new intent, so it must be re-stated rather than extended.
      Update the two merged-case assertions at `:53` and `:144`/`:157`/`:166` to
      match.
- [x] Add tests: a merged branch plans `-D`; a tag-landed hotfix still plans
      `-D`; an unmerged branch under `--force` still plans `-d`. Run the
      project's test command (`node --test`) — green before the phase is done.

## Notes

Why the existing suite did not catch this: `planDown` is a **pure planner**. It
receives `worktreeState` and emits a command string, so it can see `merged` but
never the branch's relationship to its upstream ref — which is the thing `-d`
actually objects to. No unit test of a pure planner can surface the failure; it
only appears when the emitted command runs against a real repo.

That is also why the fix belongs in the flag choice rather than in a new probe:
`merged` already implies the commits are on base, which is strictly more than
`-d` verifies, so there is nothing further to detect.

**Landed.** The flag now reads the `landed` bind that already existed at
`teardown.js:37` for the unpushed guard, rather than recomputing it — the guard
and the delete answer one question ("are these commits recoverable?"), so they
must not be able to disagree. A test pins that.

**The premise was verified against real git**, not just the planner: with the
branch pushed at provision time and the phase commits landed rather than pushed,
`git branch -d` fails with `not yet merged to refs/remotes/origin/<branch>, even
though it is merged to HEAD` and `-D` succeeds with every commit still on `main`.

That repro also **corrected the reason** recorded here. `origin/<branch>` is
behind because the phase commits after `/spec-go`'s initial push were never
pushed — *not* because landing fast-forwards base, which does not move the remote
ref at all. A branch pushed again just before completing would delete cleanly
with `-d`; the common flow does not, which is why teardown hit it.
