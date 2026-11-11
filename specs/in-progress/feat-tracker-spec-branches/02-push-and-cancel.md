---
github_issue_id: "#172"
---

# Phase 2 — Push the spec branch on the verdict; delete it on cancel ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a branch-mode spec is on the remote after either committing verdict
(on consent), and a cancelled one is removed from it — proven by planner tests.

## Tasks

- [ ] `spec-env integrate` under `specDocs: "branch"` plans a push of the spec
      branch to `land.remote` with the hotfix consent shape (already-pushed
      honoured · `--push` · otherwise hold); no rebase, no fast-forward, no PR
- [ ] `/spec` C2: run that plan for both `commit` and `commit-start`; report
      `Landed` as `pushed <remote>/<branch>` or `held — not pushed`; drop the
      "only copy" caveat from `Notes` once pushed
- [ ] `/spec-cancel`: for a never-started branch-mode spec whose branch is on
      the remote, offer to delete the remote branch (consent, recorded in the
      cancel report); decline leaves it and says it will still read as backlog
- [ ] Tests: push planned / already-pushed / held; trunk mode plan unchanged
      (stays-silent); cancel offers delete only when a remote branch exists;
      run the typecheck and test commands — green

## Notes

A push with no remote configured is cannot-tell → hold, never an error.
