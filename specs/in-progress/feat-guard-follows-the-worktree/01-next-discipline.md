---
linear_issue_id: "SKS-215"
---

# Phase 1 — `/spec-next`: the discipline follows the worktree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every route that builds a phase into a tree the session is not standing
in — rung 4 included — takes the absolute-write discipline, records a baseline
first and proves nothing leaked after; and the frontmatter stops promising
otherwise.

## Tasks

- [ ] Rewrite §3's remote-build paragraph so its condition is **the resolved
      worktree is not this session's cwd**, not *"On the `--worktree` path"*.
      Keep the existing wording that earns its place — absolute paths, every
      command `cd "<worktreePath>" &&`-prefixed, typecheck and tests included,
      and the sentence explaining that a single relative path lands the work in
      the primary checkout with nothing looking wrong at the time.
- [ ] Ungate `--record-primary` with it. The baseline is what §4b reads, so a
      rung-4 build that skipped it gets `cannot tell` instead of an answer —
      which is safe, and useless.
- [ ] Say **how to compare**: take the `worktree:` line from
      `skitterspec spec-env resolve` and compare it against cwd. Resolve the
      paths before comparing them, so a symlinked or trailing-slash spelling of
      the same tree does not read as two.
- [ ] Rewrite §4b's heading and its `Only when…` line off the flag. The existing
      test for that step is named *"the step is inert when standing in the
      worktree"* — the name is already the intended condition; only the assertion
      underneath it pins the wrong one.
- [ ] Leave the rest of §4b **exactly as it is**: the three verdicts, the ban on
      guessing and deleting, *"A path that appeared is not proof of who put it
      there"*, and cannot-tell carrying on. None of that changes.
- [ ] Fix the frontmatter description. *"builds one elsewhere only when handed
      its worktree path"* is false since SKS-196; make it say the skill builds
      where the spec resolves and refuses to guess which spec. Keep it inside the
      per-session description budget (`assets.test.js` enforces one).
- [ ] Leave §1 untouched. All four rungs, the refusal, the several-worktrees
      relay and the in-context ban stay exactly as `assets-spec-next-resolution.test.js`
      pins them — this phase changes what happens **after** resolution.
- [ ] Add the blind-spot comment beside the check (`negative-checks.md` rule 2):
      `--assert-primary-clean` watches the **primary checkout** only, so a build
      run from inside another spec's worktree leaks there unseen. Deliberately
      unhandled — reaching it takes an explicit `--worktree` typed from a second
      worktree.
- [ ] Update the three assertions in
      `packages/common/test/assets-spec-next-worktree.test.js` that pin the old
      gating — the §4b heading lookup, the "Only when this run was given
      --worktree" match, and the frontmatter "only when handed its worktree
      path" match. Each is a deliberate change of contract, not a broken test to
      make pass.
- [ ] Keep the `--worktree` path's own assertions green untouched — it is still
      documented, still validated by `cd`-ing to it and reading the resolver's
      output rather than its exit status, and still what `/spec-start` hands off
      with.
- [ ] Add the **stays-silent** cases (`negative-checks.md` rule 3): standing in
      the worktree leaves the discipline inert and §4b claiming nothing; and a
      `checkout`-mode repo, where the worktree **is** the primary checkout, must
      not read as a leak — the engine already answers `unknown` there
      (`env-building.test.js`), and the skill must not contradict it.
- [ ] Run `pnpm test` at the repo root — green before the phase is done. Then
      `pnpm build`, since `.claude/skills/spec-next` is a symlink into the
      composed distribution rather than into `packages/common/assets`.

## Notes

The source of truth is `packages/common/assets/skills/spec-next/SKILL.md` — that
is the file the tests read. The self-hosted `.claude/skills/spec-next` symlinks
into `packages/skitterspec-linear/assets/skills/`, which is composed output, so
an asset edit is live here only after a build.

No engine work. `--record-primary` and `--assert-primary-clean` already do
exactly what this phase needs on every path; they are simply not being called.
