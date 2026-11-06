---
github_issue_id: "#110"
---

# Phase 4 — completion: disposition guard + two-run complete; cancel abandons PR ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` in PR mode is two runs — ready the PR after every
loose end is disposed, then finish after the merge — and `/spec-cancel` closes
the door it opened.

## Tasks

- [ ] Engine: `spec-env complete-pr plan <spec>` (naming open to build-time
      judgment; could be `integrate --ready`) emits run 1: disposition input
      (below), push, PR create-or-ready. Run 2 is detected, not flagged: when
      the adapter says `merged`, the same verb plans pull-base, `afterLand`
      (with the real changed-file range), bucket move, teardown — the
      `hotfix land`/`finish` shape.
- [ ] Disposition input: the engine enumerates unticked `- [ ]` tasks per phase
      file, open follow-ups (Changelog `Follow-up surfaced:` lines without a
      spec), and phase-index rows not `✅`, as JSON for the skill. Enumeration
      is the engine's; deciding is the user's.
- [ ] Fork `/spec-complete` (SKILL.md): pr plan → run the disposition pass
      (each item: tick with evidence · spin off as a linked ticket via the
      provider's mint, carrying `> **Incident:**`-style linkage · drop with a
      dated Changelog reason), refuse to ready the PR while any item is
      undisposed, then push + ready, report
      `Landed: PR #N opened — finish after merge`, keep the worktree, stop.
      Second invocation post-merge runs today's §6-equivalent: afterLand,
      `specs/complete/` move, State log row, teardown.
- [ ] `/spec-cancel` in PR mode: abandon/close the open PR (host command from
      phase 2's module) before teardown; a cancelled spec leaves no open PR.
- [ ] The review page's committing verdicts stay verbs that commit; the land
      half follows the plan, so no new verdict word is needed — but the report
      vocabulary gains `PR #N opened` / `PR #N merged` (`spec-reports.md`
      `Landed` row, phase 6 writes the rule text).
- [ ] Unit tests: disposition enumeration (fixtures with unticked tasks, open
      follow-ups, mixed phase states), two-run detection truth table
      (prState × bucket), cancel-abandons-PR plan — plus stays-silent tests: a
      fully-ticked spec enumerates nothing; trunk mode never emits a
      disposition step; `land.draft: false` still refuses ready on undisposed
      items.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Why the guard is mandatory here: once the PR is ready, anyone can merge from
the host UI and the tracker closes the ticket — `/spec-complete` run 1 is the
last moment skitterspec is guaranteed to be standing there. Spun-off tickets
are minted at disposition time (not queued), so a follow-up survives even if
run 2 never happens on this machine.
