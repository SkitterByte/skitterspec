# Phase 1 — Group tasks by their source heading 🔄

> **Status:** In progress

**Goal:** a phase file's task sections survive into the sub-issue description,
and a file with a single task section projects exactly as it does today.

## Tasks

- [ ] RED — extend `sync-task-checklist.test.js` with the reported shape: tasks
      under `## Tasks`, criteria under `## Acceptance`. Assert both headings
      appear in the sub-issue body and that each checkbox sits under the one it
      was written beneath.
- [ ] RED — a control that pins Decision 3: a phase file whose checkboxes sit
      under no heading at all still projects `## Tasks`, byte-identically.
- [ ] Build a heading index in `readPhaseFiles` — line numbers of every
      `^#{2,6}\s` heading, skipping fenced lines via the existing `fenceMask`.
- [ ] Resolve each task block to the last heading before its `start`; emit
      `taskGroups: [{heading, tasks}]` in source order, keeping the flat `tasks`
      array unchanged so nothing downstream has to move.
- [ ] Render groups in `subIssueBody`: one section per group, heading preserved
      as written (Decision 2), `## Tasks` for a leading unheaded group.
- [ ] Assert a heading holding no checkboxes is not emitted — an empty
      `## Acceptance` in the mirror is noise, not fidelity.
- [ ] Assert an example heading inside a ``` fence never becomes a group.
- [ ] GREEN — `node --test packages/sync-core` green; full suite green.
