# Phase 1 — The project row ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `doctor` reports whether `linear.projectId` is set and, with
`--check-remote`, whether it resolves and belongs to the configured team — proven
by a test per state, including the two where it must stay quiet.

## Tasks

- [ ] Add `readProject(projectId)` to the API adapter (`api.js`), returning
      `{ id, name, teamIds }` (or the team edge Linear exposes) — enough to tell
      whether the project belongs to the configured team. Cover it in
      `api.test.js` beside `readTeam`, including the transport-failure path.
- [ ] Gather `state.project` in `gatherState` (`cli-sync.js`) from
      `config.linear.projectId`: `{ configured: <id|''> }` offline.
- [ ] Extend `checkRemote` to resolve the project when one is configured and the
      key works, adding `{ resolved, name, belongsToTeam }`. Reuse the existing
      classification — a transport failure must land as `skipped` here too, per
      `bug-hidden-prompt-erased`'s sibling fix in `classifyRemoteFailure`.
- [ ] Add `projectCheck` to `doctor.js` returning: `missing` when unset (exit 0),
      `ok` when set and — where checked — resolving inside the team, `broken` when
      it resolves into a different team or does not resolve at all.
- [ ] Name the blind spot in a comment: offline, the row can only report that a
      string is present — a well-formed id for a deleted project reads `ok` until
      `--check-remote` runs.
- [ ] **Stays-silent tests** (see `.claude/rules/negative-checks.md`): an empty
      `projectId` keeps `ok: true` and exits 0; a configured project that resolves
      inside the team produces no attention row; a `--check-remote` that could not
      reach Linear leaves the project row unexamined rather than `broken`.
- [ ] Counterweight test: a project id that resolves into **another team** is
      `broken` and exits 1.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The matrix test in `doctor.test.js` (`every branch of the matrix yields a known
state`) enumerates rows — extend it rather than adding a parallel one.

`skitterload` is the live fixture for the `missing` case: empty `projectId`, no
`auth` block. It must stay at exit 0 throughout.
