---
github_issue_id: "#142"
---

# Phase 2 — Worktree side ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a provisioned worktree is used at `<wt>/<prefix>` for everything
project-scoped — proven by nested up/bootstrap/dev/handoff tests.

## Tasks

- [x] Give every resolved spec a `projectPath` (`projectIn(worktreePath,
      prefix)`), and route `<worktree>/specs/…` builders through it: handoff,
      disposition, review.js's spec-dir lookup
- [x] Run `setup`, seeds, the env file (`bootstrap`), dev servers and a
      hotfix's `releaseWith` in `projectPath`; the `{worktreePath}` token is
      that folder, so "it is the cwd" stays true. `docker.composeFile` already
      resolved from the primary project folder. Git stays at the worktree root
- [x] `worktree:` in `up`, `nospec`, `bootstrap` and `resolve` names
      `projectPath` — the folder the session moves into and what `/spec-next`
      compares cwd against; `git worktree add` keeps the root. No skill text
      changes: skills already take the path the engine prints, and
      `git -C <it> mv specs/…` is right from the project folder
- [x] Look up specs in a worktree at `projectIn(<wt>)` (resolve.js search
      dirs, `allSpecs`, inflight.js); status lists each worktree's project path
- [x] Quote paths in every printed command (`shellPath`) — a repo named
      `LSC App` lays worktrees out at `LSC App-wt`
- [x] Prefix the fork-point check's `<ref>:<path>` lookup (`up` refused a
      nested spec as "not committed")
- [x] Move `cli-spec-env-status`, `-zero-arg`, `-up-from` and `-dev` tests onto
      `test/helpers/repo.js`
- [x] Tests: `cli-spec-env-worktree-side.test.js` (up → shell-run worktree add
      → bootstrap → bare resolve → branch-moved spec → handoff, both layouts);
      `shellPath` unit tests incl. a real shell round-trip; full suite 4589
      green, `test:nested` 53 green

## Notes

`cli-spec-env-up.test.js` and `cli-spec-env-bootstrap.test.js` stay on their
own fixtures: several of their scaffolds are not git repos at all, so the
helper does not fit them. The nested path they would cover is covered by
`cli-spec-env-worktree-side.test.js`.
