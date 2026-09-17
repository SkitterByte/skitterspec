---
linear_issue_id: "SKS-325"
---

# Phase 1 — The engine knows whether it is live ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env review` reports a spec's live state in text and `--json`, and
a render of a live spec reads the tree the branch is actually in.

## Tasks

- [x] Add `liveStateFor(spec, ctx)` to `env/live.js` — pure, returning
      `{state: 'on'|'off'|'held'|'unavailable', holder, url, reason}` from the
      receipt plus the primary checkout's branch. `held` names the spec holding
      the workbench; `unavailable` covers no isolation, no worktree, and a spec
      the engine could not resolve.
- [x] Give `spec-env live status` a real `--json` (it currently accepts the flag
      and prints the text block regardless), carrying the same fields.
- [x] Carry the state onto the render: one `live:` line in the text output, and
      a `live` key in `--json`, both from `liveStateFor` so text and JSON cannot
      disagree — the same discipline `reviewTierStack` established.
- [x] Teach `viewFor` (`env/serve.js`) the live case: while a spec is live its
      branch is checked out in the **primary checkout** and its worktree is
      detached, so the diff is collected there. Name the blind spot beside it.
- [x] Tests: each of the four states from a scaffold; text and `--json` agree;
      a live spec's render collects the primary checkout's diff rather than the
      detached worktree's.
- [x] **Stays-silent test** (`.claude/rules/negative-checks.md` rule 3): a
      project with no isolation, a spec with no worktree, a primary checkout
      that could not be read, and a `--docs` render each report `unavailable`
      and print **no line at all** — not a warning, not an explanation of the
      absence.
- [x] **Deviation, recorded rather than silent:** an unreadable receipt was
      listed above as a fourth `unavailable` input, and it is not one. The
      branch checked out in the primary checkout is the authority — this file's
      own header says the receipt is metadata — so a lost or unreadable receipt
      costs the **holder's name** and never the state. Reading it as
      `unavailable` would blank the line for a checkout that is plainly on a
      feature branch, throwing away a positive signal to honour an absence,
      which is rule 1 backwards. Tested as `held` with `holder: null`.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

`unavailable` is the cannot-tell state and it routes to silence, which is rule 4.
The three inputs that produce it are all healthy: a repo without isolation, a
backlog spec, and a receipt written by a version that has moved on.

Three things were added that the tasks did not name, each because the code asked
for it rather than to be thorough:

- **`liveStateLine`** — the null-for-`unavailable` renderer. Putting the silence
  in one pure function is what makes the stays-silent tests assert *nothing is
  printed* rather than each caller's phrasing of nothing.
- **`liveContext`** — one builder for the `ctx` every caller passes, so
  `live status --json` and the review render come through the same probe. "The
  page and the command agree" is then a property of the code and not a habit.
- **The worktree-absent refusal gained a live exception.** `spec-env review`
  refuses a spec with no worktree, and a live spec can have none — `live take`
  moves the branch here, and the worktree may have been removed since. Refusing
  there would refuse a spec whose diff is sitting in the primary checkout. Every
  other missing worktree still refuses exactly as before.

`viewFor` and `headBranchOf` are now exported from `serve.js`, which is what
lets the live-tree behaviour be tested directly rather than inferred from a
rendered page.
