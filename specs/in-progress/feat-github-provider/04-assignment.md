---
linear_issue_id: "SKS-412"
---

# Phase 4 — Assignment hoisted to the kit + `/spec-claim` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the spec's Developer is mirrored to GitHub assignees, with the
assignment logic shared by linear and github — linear's behaviour unchanged.

## Tasks

- [ ] Hoist linear's assignment flow (`assign`, `users`, `whoami`, the
      `fieldOwnership.assignee` rules, release-on-complete) from
      `packages/linear/src/cli-sync.js` into provider-kit, behind optional
      adapter ops; rewire linear onto it.
- [ ] GitHub ops: `readViewer` → login, `listUsers` → repo collaborators,
      assign/unassign on the spec issue (phases left to whoever claims them).
- [ ] `spec-claim` skill and the `spec-tracker-assign` seam for github.
- [ ] Tests: linear's existing assignment tests pass untouched; github take /
      hand back / hand to a teammate; a non-collaborator login is a named
      refusal. Full workspace suite green.
