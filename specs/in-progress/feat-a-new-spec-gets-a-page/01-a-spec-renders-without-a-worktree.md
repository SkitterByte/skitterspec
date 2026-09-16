---
linear_issue_id: "SKS-301"
---

# Phase 1 — The engine renders a spec that has no worktree ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env review <spec> --docs` writes a page of a backlog spec's own
documents from the current tree, carrying the `authoring` buttons, and shows no
other spec's files even when another session has written some.

## Tasks

- [x] Add a `docs` mode to `collectReview` (`review.js:237`). It takes the
      `owned` path list and a `git` reader for the tree in hand, rather than
      deriving files from a worktree ref: tracked paths diff against `HEAD`,
      untracked ones render whole as new files, exactly as `untrackedFiles`
      already handles.
- [x] Wire `--docs` in `specEnvReview` **before** the worktree check
      (`cli.js:2046`) and never through it. Resolve the spec folder, take the
      `owned` list from the `spec-env stage` path, and read with
      `rawGitReader(<tree in hand>)`.
- [x] Add `commit-start` to `VERDICTS` (`review.js:417`) and to `COMMITTING`
      (`review.js:430`), and `authoring` to `BUTTON_SETS` (`review.js:446`) with
      `commit-start` + `commit` as its committing pair.
- [x] Render the `authoring` bar in `page.html`, reusing the existing verdict
      styling and the `file://` command list — a spec page is as likely to be
      read from a file as any other.
- [x] Have the pass carry the `owned` paths, so the commit hand-off gets an exact
      pathspec rather than recomputing one at verdict time.
- [x] **Name the blind spot beside the owned-paths filter**
      (`.claude/rules/negative-checks.md` rule 2): what would fool a
      render-the-whole-tree version is another session writing its own spec
      between the render and the verdict — its files would appear on this page
      and be committed under this verdict. The filter is why `stage` is the
      source and the tree is not.
- [x] Tests: a backlog spec with no worktree renders; the page contains its three
      documents and **not** a second uncommitted spec's; `--buttons authoring`
      round-trips and an unknown set is still refused by name; `commit-start` is
      accepted as a verdict and `continue` is still rejected on this set.
- [x] **Stays-silent test** (rule 3): a spec *with* a worktree renders exactly as
      it does today — same bytes — so the new mode is additive and the existing
      path is untouched.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

`spec-env stage feat-<name> --json` already answers with `tree`, `owned` and
`foreign`, and it reads the tree you are standing in. There is nothing new to
compute — this phase consumes it, through `resolveSpecDocs` in `cli.js`.

Do not touch the worktree check itself: `feat-stranded-pass-can-be-disowned`
edits it for `--drop`, and disjoint changes are what let the two specs land in
either order. Kept: `--docs` never reaches that check rather than relaxing it.

**Two things the plan did not see, both found by rendering rather than reading.**

`isNoise` folds everything under `specs/` away, which is right for a phase's
code diff and exactly backwards here: the first docs page rendered with all
three files collapsed and nothing open on it. The rule now inverts for this mode
(`noiseOf`), so the spec's own documents are the subject and a declared
companion — a tracker snapshot — is what stays folded.

`verdictSaid` has a fall-through returning `discuss first` for a verdict it does
not know, so an honoured `commit-start` told a reader who had just pressed a
green button that their review ended in a conversation. Adding a verdict to
`COMMITTING` and not to that list is silent, so there is now a test naming the
failure rather than the fix.

**Six existing tests pinned the verdict vocabulary literally** and were updated
by hand — which is the guard working, not noise: a regex loose enough to accept
a sixth verdict silently would accept a committing verdict missing from
`COMMITTING`, which is a committing verdict an open comment does not block. One
of them drives off `VERDICTS` and asserts `/spec-reviewed`'s own prose names
every word, so the skill gained `commit-start` too — without which the
`file://` hand-back would have been undocumented.

**Not covered, deliberately.** `resolveSpecDocs` routes an unreadable git to
`cannot tell` rather than to an empty file set, but there is no test for it: the
CLI resolves the spec through the same repo it would have to break to reach that
branch. The guard is stated beside the code instead.
