---
linear_issue_id: "SKS-207"
---

# Phase 1 — The daemon is owned by the primary checkout ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a review server survives the teardown of whatever worktree happened to
start it, and a server that cannot serve is replaced rather than adopted.

## Tasks

- [x] `serveProcFor` takes the script path from the **primary checkout** rather
      than from `__dirname`. `dir` is already resolved there (`cli.js:2650`), so
      the root is in hand; `__dirname` is the one place that leaks the
      launching copy.
- [x] Fall back to `__dirname` when the primary checkout holds no copy of
      `serve.js` — a global install or `npx` is an ordinary state, not a fault.
      Three states, and the unknown one keeps today's behaviour rather than
      refusing.
- [x] Record the resolved `script` in `review-serve.json`, so the thing that
      broke is written down instead of being invisible to adoption.
- [x] **Adopt only a server whose script is still on disk.** A live pid plus a
      readable settings file is not proof it can serve. This is a positive
      signal — the file being *there* — and the unknown case (no `script`
      recorded, an older settings file) adopts as before rather than killing a
      working server.
- [x] Tests: a proc descriptor built from a worktree points at the primary
      checkout's copy; with no copy there it falls back to `__dirname`; a
      settings file naming a script that no longer exists is not adopted; a
      settings file with no `script` key **is** adopted (stays-silent).
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

The failure this phase fixes is silent and total: the daemon answers on the port,
so every check short of asking it for a page says it is healthy — and it fails
for every spec, not just the one whose worktree went.
