---
github_issue_id: "#163"
---

# Phase 2 — CLI and JSON output ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `epic status` and `status` print the next action as plain text that
reads raw under `watch`, and `--json` carries the same answer.

## Tasks

- [x] `formatEpicStatus`: an aligned member table (member · state · next ·
      tab) above the existing rows; drop the Ready now / In flight / Blocked /
      Done rows the table now carries
- [x] Add `nextAction` per member to `epic status --json`
- [x] Bare `skitterspec epic status` resolves the epic from the worktree
      the command runs in; elsewhere, without a name, it refuses and lists
      epics with members in flight
- [x] `skitterspec status`: the next action on each in-flight row
- [x] Tests: output snapshot for the worked example; bare form inside and
      outside an epic worktree; `status` rows; JSON parity with the human view
- [x] Run typecheck + tests — green before the phase is done

## Notes

- The epic page's tier stack moved to phase 3: printing its URL before the
  route exists would hand out a link to a diff page.
