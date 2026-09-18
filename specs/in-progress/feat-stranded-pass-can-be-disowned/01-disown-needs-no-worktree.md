---
linear_issue_id: "SKS-305"
---

# Phase 1 — Disowning stops needing a worktree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env review <spec> --drop <code>` clears a pass on a spec whose
worktree is gone, proven by a test that fails today, while every path that reads
the diff or acts on a verdict still refuses.

## Tasks

- [ ] **Write the failing test first.** A spec resolvable from `specs/complete/`
      with a pending pass and no worktree on disk: `--drop <code>` clears it and
      exits without the provision message. This is red against `cli.js` as it
      stands.
- [ ] Move the `--drop` branch (`cli.js:2227`) ahead of the worktree check
      (`cli.js:2046`) in `specEnvReview`. The pending store lives in the primary
      checkout, so the branch reads and writes `.spec-env/reviews/` only.
- [ ] Keep the check for every other path — the render, `--claim`,
      `--claim-since`, `--notes`, `--verdict`, `--resolve`. Each either reads the
      diff through `git -C <worktree>` or acts on a verdict that needs the tree.
- [ ] **Name the blind spot beside the relaxed gate**
      (`.claude/rules/negative-checks.md` rule 2): what would fool it is a spec
      folder **deleted** rather than completed — `resolveSpecWithWorktree` has no
      document to resolve, so the pass stays unreachable *by name* and only
      `review waiting` can see it. Relaxing the worktree check does not cover
      that, deliberately.
- [ ] Rewrite the refusal the worktree-requiring paths emit. Today it says
      `run /spec-start to provision it`, which for a completed spec is advice to
      resurrect it in order to throw a pass away. It should name the pass count
      when there is one, `--drop <code>`, and `spec-env review waiting`.
- [ ] Clear the ten waiting passes with repeated `--drop`, and record each code
      and verdict in the spec's Changelog — dropping a verdict unread is a
      decision, so it goes on the record.
- [ ] Tests: `--claim` on a worktree-less spec still refuses **and** its message
      names `--drop`; `--drop` on a provisioned spec behaves exactly as it does
      today; a code matching nothing still refuses and still names nothing.
- [ ] **Stays-silent test** (rule 3): a repo whose specs are all provisioned and
      have no waiting pass produces byte-identical output for the render, for
      `review waiting`, and for a `--drop` of an unknown code.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The ten passes are good fixtures, so run `spec-env review waiting` before the
clear-out and keep the output for the test's expectations.

Dropping them is the last task, not the first: the test must be red against the
current code, and the fixtures are what prove the fix on real data.
