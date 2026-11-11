---
github_issue_id: "#163"
---

# Phase 2 — CLI and JSON output ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `epic status` and `status` print the next action as plain text that
reads raw under `watch`, and `--json` carries the same answer.

## Tasks

- [ ] `formatEpicStatus`: an aligned member table (member · state · next ·
      tab) above the existing rows; drop the Ready now / In flight / Blocked /
      Done rows the table now carries
- [ ] Add `nextAction` per member to `epic status --json`
- [ ] Bare `skitterspec epic status` resolves the epic from the worktree
      the command runs in; elsewhere, without a name, it refuses and lists
      epics with members in flight
- [ ] End the human output with the epic page's tier stack when the review
      server is up, or the command that starts it
- [ ] `skitterspec status`: the next action on each in-flight row
- [ ] Tests: output snapshot for the worked example; bare form inside and
      outside an epic worktree; `status` rows; JSON parity with the human view
- [ ] Run typecheck + tests — green before the phase is done
