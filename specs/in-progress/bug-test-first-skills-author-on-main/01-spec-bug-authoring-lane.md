# Phase 1 — `/spec-bug` takes the authoring lane ✅

**Goal:** `/spec-bug` provisions its worktree **before** it writes a line, so the
first thing it does is no longer the one thing the main guard refuses.

The engine needs nothing: `specEnvUp`'s authoring branch already accepts
`bug-<name>` with `--docs`. This phase is the skill catching up with it — plus
the one difference from `/spec` that must not be lost in the copy.

**The second `up` is that difference.** `--docs` skips the `setup` commands
because writing markdown needs no dependencies, and `/spec` can defer them to
`/spec-start`. A bug has no `/spec-start`: §3 runs the suite three steps later,
in that same tree. So the flagless `up` runs at the end of §2, and the reason is
written down — a converted skill that dropped it would trade a refused write for
a worktree with no dependencies, which is not better.

## Tasks

- [x] Rewrite `packages/common/assets/skills/spec-bug/SKILL.md` §2: provision
      with `skitterspec spec-env up bug-<name> --docs`, run the printed
      `git worktree add`, move the session with a plain `cd`, confirm with a
      bare `spec-env resolve` (`negative-checks.md` rule 1), then re-run `up`
      without the flag for the `setup` commands. Write the stub **there**.
- [x] Say why in one paragraph: `main` is where work lands, and `main-guard.cjs`
      refuses the write the old step made — so a reader who moves it back knows
      what it costs.
- [x] Fix §4's flesh-out sentence, which claims the stub was "moved into the
      worktree". Nothing is moved any more.
- [x] Keep the `<!-- seam:worktree-bootstrap -->` seam and the `--no-worktree`
      opt-out working, and keep the no-isolation branch untouched.
- [x] Update the authoring lane's `authoring:` output line
      (`packages/common/src/cli.js`), which names `/spec` as the writer — three
      skills use the lane now.
- [x] Green: `node --test packages/common/test/assets-test-first-authors-in-worktree.test.js`
- [x] `node scripts/build-dist.js all`, then the full suite: `pnpm test`

## Notes

Two existing tests had to move with the skill rather than merely pass beside it.
`assets.test.js`'s "no longer moves its stub" asserted `commits the stub first`
as *what replaced the move* — true of the old design and false now, since there
is no stub on the base branch to commit; it asserts the authoring lane instead,
and that the stub commit is gone with it. `assets-emphasis.test.js` caught a
`**bold**` span wrapped across a line break, which is the repo's own rule in
`CLAUDE.md`.

`/spec-hotfix keeps the move, and says why it differs` still passes, and should:
phase 2 is what changes it.
