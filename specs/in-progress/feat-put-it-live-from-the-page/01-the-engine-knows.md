---
linear_issue_id: "SKS-325"
---

# Phase 1 — The engine knows whether it is live ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env review` reports a spec's live state in text and `--json`, and
a render of a live spec reads the tree the branch is actually in.

## Tasks

- [ ] Add `liveStateFor(spec, ctx)` to `env/live.js` — pure, returning
      `{state: 'on'|'off'|'held'|'unavailable', holder, url, reason}` from the
      receipt plus the primary checkout's branch. `held` names the spec holding
      the workbench; `unavailable` covers no isolation, no worktree, and a spec
      the engine could not resolve.
- [ ] Give `spec-env live status` a real `--json` (it currently accepts the flag
      and prints the text block regardless), carrying the same fields.
- [ ] Carry the state onto the render: one `live:` line in the text output, and
      a `live` key in `--json`, both from `liveStateFor` so text and JSON cannot
      disagree — the same discipline `reviewTierStack` established.
- [ ] Teach `viewFor` (`env/serve.js`) the live case: while a spec is live its
      branch is checked out in the **primary checkout** and its worktree is
      detached, so the diff is collected there. Name the blind spot beside it.
- [ ] Tests: each of the four states from a scaffold; text and `--json` agree;
      a live spec's render collects the primary checkout's diff rather than the
      detached worktree's.
- [ ] **Stays-silent test** (`.claude/rules/negative-checks.md` rule 3): a
      project with no isolation, a spec with no worktree, and an unreadable
      receipt each report `unavailable` and print **no line at all** — not a
      warning, not an explanation of the absence.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

`unavailable` is the cannot-tell state and it routes to silence, which is rule 4.
The three inputs that produce it are all healthy: a repo without isolation, a
backlog spec, and a receipt written by a version that has moved on.
