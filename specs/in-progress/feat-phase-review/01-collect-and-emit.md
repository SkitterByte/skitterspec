---
linear_issue_id: "SKS-139"
---

# Phase 1 — collect a worktree's diff, and emit a page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env review <spec>` writes a self-contained HTML page
of that spec's uncommitted work to `.spec-env/reviews/<spec>.html`, read entirely
from the caller's own checkout — proven by tests over a fixture worktree.

## Tasks

- [ ] Add `packages/common/src/env/review.js`: resolve the spec (reuse
      `resolveSpecWithWorktree`), collect its changes, and render the page. Pure
      enough to unit-test — take the output path and the clock from the caller.
- [ ] Collect with `git -C <worktreePath>` only. **Never** `cd`, never spawn
      inside the worktree: the whole feature exists because the caller's shell
      stays where it is.
- [ ] Read `git status --porcelain` **without trimming the whole output** — the
      first column is a space for unstaged changes, and a leading trim shifts
      every path by one character. (Found the hard way in the prototype.)
- [ ] Generate each patch with a large `-U` so the patch is the whole file, and
      fall back to `-U3` for any file whose patch exceeds a 400KB constant in the
      module. Record `whole: true|false` per file so the viewer can say which it
      is. **No config key** — nobody is going to tune this, and an untuned key is
      a surface to document, validate and test for no gain.
- [ ] Include **untracked** files via `git diff --no-index -- /dev/null <path>`,
      marked `status: "new"`. A plain `git diff` cannot see them, and a new test
      file is the single most review-worthy thing a phase produces.
- [ ] Mark bookkeeping files (`specs/**`, the push snapshot) as `noise: true` so
      the viewer can collapse them. The engine knows the spec's own paths; the
      viewer should not be guessing from regexes.
- [ ] Support `--branch`: everything since the base branch (`base...HEAD` plus
      the working tree), for reviewing a whole spec rather than the last phase.
      Default stays the uncommitted working tree.
- [ ] Write to `.spec-env/reviews/<spec>.html`, honouring `--out` when given.
      Create the directory. `.spec-env/` is already gitignored by the installer.
- [ ] Emit one self-contained file: no external stylesheet, script or image
      beyond a Google Fonts link. Escape `</` inside the embedded JSON so the
      data island cannot close its own script tag.
- [ ] Wire `case 'review':` into the `spec-env` dispatch, add it to the usage
      block and the `spec-env <cmd>` help. Refuse an unknown spec by name rather
      than falling back to the branch.
- [ ] Add `packages/common/test/env-review.test.js` over a fixture repo with a
      linked worktree: modified, untracked and deleted files all appear; the
      patch is whole-file by default and `-U3` past the limit; `--branch`
      includes committed work the default form omits; the page parses as HTML and
      its JSON island round-trips; and **the caller's cwd and the primary
      checkout are untouched afterwards** (the isolation claim, pinned).
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

The prototype's collector is the reference implementation and its two bugs are
already fixed in it: the porcelain trim above, and taking `--numstat`'s first
line rather than splitting the whole output. Port it rather than rewriting from
memory.

Deleted files need deciding rather than discovering: a deletion has no "after"
content, so whole-file context means the **before** file. Render it as removed
lines and do not fall over.
