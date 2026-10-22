---
linear_issue_id: "SKS-412"
---

# Phase 4 — Assignment hoisted to the kit + `/spec-claim` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the spec's Developer is mirrored to GitHub assignees, with the
assignment logic shared by linear and github — linear's behaviour unchanged.

## Tasks

- [x] Hoist linear's assignment flow (`assign`, `users`, `whoami`, the
      `fieldOwnership.assignee` rules, release-on-complete) from
      `packages/linear/src/cli-sync.js` into provider-kit, behind optional
      adapter ops; rewire linear onto it.
- [x] GitHub ops: `readViewer` → login, `listUsers` → repo collaborators,
      assign/unassign on the spec issue (phases left to whoever claims them).
- [x] `spec-claim` skill and the `spec-tracker-assign` seam for github.
- [x] Tests: linear's existing assignment tests pass untouched; github take /
      hand back / hand to a teammate; a non-collaborator login is a named
      refusal. Full workspace suite green.

## Notes (built)

- **Hoisted:** `provider-kit/src/assignment.js` (`makeAssignmentCommands`)
  owns `assign`, `whoami` and `users`; linear binds it with its team-keyed
  store and wording, and its 880 tests pass untouched. Identity resolution was
  already the kit's (`identity.js`); only the commands moved.
- **The kit gained one optional hook, `validateAssignee`,** that linear does
  not pass. GitHub uses it: `GET /repos/o/r/assignees/<login>` answers 204/404,
  so a non-collaborator is refused BEFORE the stamp is committed (GitHub would
  otherwise refuse it at push). A check that cannot run is a cannot-tell and
  the stamp proceeds.
- **GitHub binding:** id = login, store scope = `github.com/<owner>`, `users`
  = the repo's assignees filtered by login. New adapter ops `searchUsers`,
  `checkAssignable`; new `src/identity.js`.
- **The projection already carried the assignee** (`fields.assigneeId` =
  `github_assignee_id`), so apply sends it with no new code — a test pins it.
- `/spec-claim` and the assign / next-start / tracker-sync / tracker-start
  seams ported from linear's.
