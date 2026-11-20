---
github_issue_id: "#276"
---

# Phase 1 — Engine: offer on `complete`, `--reopen` plan ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env resume` declares a re-open offer on a completed spec, and
`--reopen` prints a plan that forks from base and moves the bucket. Unit
tests prove both, including which refusals stay offer-free.

## Tasks

- [x] In `env/resume.js` `planResume`, keep the `complete` refusal and attach
      `offer: { kind: 'satisfy', label: 'Re-open <spec>', command: 'skitterspec spec-env resume <spec> --reopen' }`
      when the overview's `Type` is not Hotfix or Epic
- [x] Add `planReopen(target, env)`. It refuses (no offer) when a worktree
      exists or the spec's branch has commits not merged into base. A merged
      leftover branch is planned as `git branch -f <branch> <base>`. Otherwise
      it returns `commands` (`spec-env up <spec>`), `then` (`bootstrap`) and
      `move` (`git mv specs/complete/<spec> specs/in-progress/<spec>`)
- [x] Check that `spec-env up` forks a spec found only in `complete/` without
      refusing on its bucket; adjust `up` if it does
- [x] Wire `--reopen` into `cli.js`'s resume verb: read whether the branch
      exists and is merged into base, then render `offer:` and the plan in
      `resumeLines`, and the same fields in `--json`
- [x] Tests: `complete` declares the offer. Stays-silent tests: `cancelled`,
      `backlog`, a completed Hotfix and a completed Epic declare none. Also
      `--reopen` with a merged leftover branch, an unmerged one, and an
      existing worktree
- [x] Run `pnpm typecheck` and `pnpm test` until both are green
