---
github_issue_id: "#172"
---

# Phase 2 — Push the spec branch on the verdict; delete it on cancel ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a branch-mode spec is on the remote after either committing verdict
(on consent), and a cancelled one is removed from it — proven by planner tests.

## Tasks

- [x] `spec-env integrate --docs` under `specDocs: "branch"` plans a push of
      the spec branch to `land.remote` with the hotfix consent shape
      (already-pushed honoured · `--push` · otherwise hold); no rebase, no
      fast-forward, no PR. Without `--docs` the code land is unchanged
- [x] `/spec` C2: run that plan for both `commit` and `commit-start`; report
      `Landed` as `pushed <remote>/<branch>` or `held — not pushed`; drop the
      "only copy" caveat from `Notes` once pushed
- [x] `/spec-cancel`: for a never-started branch-mode spec whose branch is on
      the remote, offer to delete the remote branch (consent, recorded in the
      cancel report); decline leaves it and says it will still read as backlog
      — `spec-env down` plans it when the branch's range is docs-only
- [x] Tests: push planned / already-pushed / held / no remote; trunk `--docs`
      and code land unchanged (stays-silent); down offers the delete only for a
      docs-only branch, confirm-first even under "always"; `pnpm test` (4856)
      and `test:nested` (167) — green

## Notes

A push with no remote configured is cannot-tell → hold, never an error.
