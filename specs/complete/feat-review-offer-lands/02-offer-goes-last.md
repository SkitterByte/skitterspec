---
linear_issue_id: "SKS-183"
---

# Phase 2 — `/spec-next`: the offer goes last and asks ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the phase report ends on a question about the page, so the offer is the
last thing on screen rather than quoted output buried mid-report.

## Tasks

- [x] Rewrite step 5's output shape in
      `packages/common/assets/skills/spec-next/SKILL.md` — prose addressed to the
      reader, not a fenced block, ending in a question
      (*"Want a written review of it before you commit?"*).
- [x] Move the offer **after** the `Next: phase N` line in step 6's report
      ordering, and say so explicitly in both steps, since the two currently
      disagree about what comes last.
- [x] Keep every existing rule intact and restate none of them loosely: render
      after tests pass and before the commit, never write the review unasked,
      never publish, never fatal, silent no-op without
      `specs/.core/env.config.json`.
- [x] Keep relaying the engine's `open:` file:// URL rather than the bare path.
- [x] Pin the new shape in a new `packages/common/test/assets-offer-last.test.js`
      (**not** `assets-review.test.js` — see Outcome):
      the offer is a question, it carries the `open:` URL, and it is positioned
      after the next-phase line.
- [x] **Stays-silent test:** a project with no `env.config.json` still produces
      no offer, no page and no explanation of the absence.
- [x] **Discovered in phase 1** — fix step 1's validation command. It says to run
      `skitterspec spec-env resolve --dir <path>` and check the `worktree:` line,
      but `--dir` sets the **repo root** (`packages/common/src/cli.js:2248`), not
      the worktree to resolve from: on a repo with two or more worktrees it
      refuses with *"no spec given, and N specs have worktrees"* and validates
      nothing. Replace it with a form that works — `cd "<path>" && skitterspec
      spec-env resolve`, which resolves the spec from where it is standing and
      prints the `worktree:` line to compare.
- [x] Add a test pinning that the step's command is one that can actually
      validate a path, so the prose cannot drift back to a flag that does
      something else.
- [x] Run the project's test command — green before the phase is done.

## Notes

Non-blocking on purpose (decision 4). The operator chains `/commit && /spec-next`
as one line and works through phases quickly; a question that ends the turn would
tax every phase to fix a problem that being last already fixes.

## Outcome

Thirteen tests, all green; full suite **1878 pass, 0 fail**.

**Deviation — where the tests live.** The phase named `assets-review.test.js`.
That file guards the review *page template* — it runs the page's own script
against a DOM shim — and has nothing to do with skill prose. The new
`assets-offer-last.test.js` holds the offer's shape and position, and the
`--dir` fix went into `assets-spec-next-worktree.test.js`, which already owns
step 1.

**The broken command was pinned by a passing test.** `assets-spec-next-worktree.test.js`
asserted `/spec-env resolve --dir <path>/` — so the step read as validated for
as long as the test agreed with the prose, and the test agreed with it all the
way through being wrong. Its replacement asserts the working form *and* that
`--dir` is named as not the answer, which is the positive signal
`.claude/rules/negative-checks.md` rule 1 asks for: a test that only checks the
right command appears somewhere in the file would pass again the moment someone
reintroduced the wrong one alongside it.

**Two edits the project's own rules forced**, both caught by existing tests
rather than by review:

- A `**bold**` span crossing a hard line break (`assets-emphasis.test.js`) —
  `CLAUDE.md` forbids it because round-tripping editors mangle it.
- Re-wrapping prose broke two sibling assertions that match across the wrap.
  Fixed by following the file's existing convention of whitespace-tolerant
  regexes (`/cwd is not\s*\n?consulted/i`) rather than by bending the prose to
  the test.
