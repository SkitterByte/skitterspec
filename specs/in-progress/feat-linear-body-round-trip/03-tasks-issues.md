# Phase 3 — Tasks ↔ Issues round-trip ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

Delivered like Phase 2, in two commits: **3a** read-model (parse task lines to
keyed `{id,text,done}`, normalize remote issues, adapter issue ops, fixtures);
**3b** write-side (task-line denormalizer + pull/push wiring + live smoke).

**Goal:** a task checkbox maps to a Linear Issue — text co-authored, completion
binary both-ways — with the issue identifier carried inline on the task line;
proven by fixtures and a live smoke.

## Tasks — 3a (read-model) ✅

- [x] `normalize.js`: `parseTaskLine` + keyed `tasks` field of `{ id, text, done }`
      — `id` is the inline `(SKI-123)` identifier (absent = unlinked/new), `done`
      the `[x]`/`[ ]` state, `id` stripped from `text` so wording compares cleanly.
- [x] `normalizeRemote`: issues → the same `{ id, text, done }` (id ← identifier,
      text ← title, done ← `state.type === 'completed'`).
- [x] `mcp.js`: adapter issue ops — `listIssues`, `createIssue`, `updateIssue`
      (`save_issue` upsert on `id`).
- [x] Read-model fixtures (parse, local tasks, remote issues, a task closed in
      Linear classifying as per-item pullable). Suite 275 green.

## Tasks — 3b (write-side) ✅

- [x] `write.js` task-line denormalizer: `updateTaskLine` (text + checkbox by inline
      id), `addTaskLine` (Linear-only issue), `stampIssueId` (after create),
      `applyTasksPull`. Byte-untouched elsewhere.
- [x] Wire `pull.js` to apply keyed task items via the denormalizer (dispatch
      milestones vs tasks); generalize `push.js`'s keyed plan to emit `issuesPush`
      (create/update); teach `/spec-push` to apply the issue plan + stamp inline
      ids and `/spec-pull` to fetch issues into the projection. CLI surfaces it.
- [x] Tests: denormalizer units, a pull (issue closed in Linear → `[x]`), a push
      (text edit → issue update plan; new task → create plan). **Live shape check**
      on team SKI — caught that real issues use flat `statusType`/`id=identifier`
      (not `state.type`); fixed `normalizeRemote` + added a regression test. Suite
      282 green.

## Notes

Assignee/priority/exact issue state are Linear-owned — never written from the repo.
Keep the inline-id parser tolerant so specs without linked issues are unaffected.
