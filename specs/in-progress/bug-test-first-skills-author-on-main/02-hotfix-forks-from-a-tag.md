# Phase 2 — `/spec-hotfix`, and forking from a tag it has not written down yet ✅

**Goal:** `/spec-hotfix` authors in its worktree too — which needs the engine to
learn the base tag from the command line, because the spec that would carry it
does not exist yet.

**Why phase 1's fix does not simply repeat here.** `spec-env up` forks a hotfix
from `spec.baseRef`, read off the spec's `> **Base version:**` header. In the
authoring lane there is no spec, `resolveSpecless` carries no base ref, and
`planUp` falls back to `currentBranch() || 'HEAD'` — so the worktree would fork
from `main` and the fix would be written against the wrong code, silently. That
is worse than the refused write it replaces, which is exactly why this is not
phase 1.

**`--from <ref>` is the positive signal.** The operator names the tag, the engine
forks from it, and the spec written in that tree records the same tag in its
header — where every later verb (`/spec-complete`'s tag-and-cherry-pick) already
reads it.

**The `mv` across stays gone, not merely unnecessary.** §3 currently moves the
stub into the worktree by hand, with a `mkdir -p` and a long paragraph about
what `mv` does to a missing destination. Written in the worktree, none of it
happens — so the paragraph goes with it rather than standing as advice for a
step that no longer exists.

## Tasks

- [x] `packages/common/src/cli.js`: accept `--from <ref>` in the flag parser,
      and let the authoring lane pass it as `planUp`'s `forkRef`. It applies to
      the authoring lane only — a resolved spec's own header stays the authority.
- [x] Refuse `--from` where it cannot be honoured rather than ignoring it: a ref
      git does not know, or a spec that already resolves.
- [x] Rewrite `packages/common/assets/skills/spec-hotfix/SKILL.md` §3 on phase
      1's shape, with the tag on the `up` line and the hand-move deleted.
- [x] Tests: extend the phase-1 asset test to `/spec-hotfix`, and add engine
      tests for `--from` — it forks from the named ref, it refuses an unknown
      one, and a stays-silent case where no `--from` is passed and nothing
      changes.
- [x] Green: `node --test packages/common/test/assets-test-first-authors-in-worktree.test.js`
      plus the new CLI test
- [x] `node scripts/build-dist.js all`, then the full suite: `pnpm test`

## Notes

**A second bug fell out of the flagless re-run**, and it was found by writing
the test for it rather than by using it. `specEnvUp` guarded its two git reads
on `authoring` — the run that *opened* the lane — where the honest condition is
whether the spec has a document at all. The re-run resolves off the registry
record the lane left behind, so `authoring` is false while `spec.path` is still
`null`, and `path.relative(dir, null)` **threw**. A crash, not a refusal, on the
exact command phase 1 had just told `/spec-bug` to run. The guard now asks
`authoring || !spec.path`, and the test that caught it covers both skills.

Phase 1 shipped that instruction untested; this phase's test is what closed it.

Two tests moved with the skill rather than merely passing beside it:
`assets.test.js`'s "/spec-hotfix keeps the move" asserted exactly what this
phase deletes, and the emphasis rule caught another `**bold**` span wrapped
across a line break.
