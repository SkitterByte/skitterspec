# Phase 3 — `push` refuses without validated states ⬜

> **Status:** Not started

**Goal:** a misconfigured `states` name cannot reach Linear, where it is silently
ignored.

**Blocked on** the Open question in `00-overview.md` — major bump now, or one
minor of loud warning first. Settle it before starting.

## Tasks

- [ ] Accept `--workspace-states <file>` on `spec-sync push`, reusing the flag
      parsing and `validateStates` call `specSyncStatus` already has
      (`cli-sync.js:305`).
- [ ] Refuse when it is absent: exit non-zero with the fix instruction, unless
      `--skip-state-check` is passed. Refuse on a bad name the same way.
- [ ] Confirm the exit code actually propagates through
      `bin/skitterspec-linear.js` — it was dropped once before
      (`feat-linear-mirror-fidelity` Phase 4) and a spawn test guards it.
- [ ] Test all four paths: no flag → refuse; bad name → refuse; good names →
      plan printed; `--skip-state-check` → plan printed.
- [ ] Update `/spec-push` step 3 — the states check is no longer advisory; the
      fetched names file is passed to `push`, not only to `status`. Guard the
      prose with an assets test.
- [ ] Update `linear.config.md` and `SETUP.md` where they describe the states
      check as a recommended step.
- [ ] GREEN — full suite green. Commit with a `Release-Note:` and, if the Open
      question resolved to a major, the breaking-change note.
