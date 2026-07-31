# Phase 3 — Tasks ↔ Issues round-trip 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress (3a read-model)

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

## Tasks — 3b (write-side) ⬜

- [ ] `write.js` task-line denormalizer: apply pulled issue edits (text, checkbox)
      to the matching task line by inline id; append `(SKI-123)` to a newly-created
      issue's line; add a task line for a Linear-only issue. Byte-untouched
      elsewhere.
- [ ] Wire `pull.js` to apply keyed task items via the denormalizer; extend
      `push.js`'s plan to issues (create/update); teach `/spec-push` to apply the
      issue plan + stamp inline ids. Item-level conflicts refuse (Phase 1).
- [ ] Tests: local text edit → issue update, tick `[x]` locally → issue closed,
      close issue in Linear → `[x]` pulled, new task → new issue with inline id.
      **Live smoke** on team SKI. Typecheck + tests green.

## Notes

Assignee/priority/exact issue state are Linear-owned — never written from the repo.
Keep the inline-id parser tolerant so specs without linked issues are unaffected.
