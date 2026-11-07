---
github_issue_id: "#119"
---

# Phase 1 — `hotfix.releaseBranch` + fork from the release branch ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a branch-based hotfix forks from the remote release branch's head and
records where it forked — and an unset key changes nothing.

## Tasks

- [x] Add `hotfix.releaseBranch` (`""`) and `hotfix.tag` (`true`) to config
      defaults and parser
- [x] Hotfix provisioning: with `releaseBranch` set, fetch and fork from
      `<remote>/<releaseBranch>`; accept and write `Base version: <branch>@<sha>`
- [x] Parse `<branch>@<sha>` wherever `Base version` is read (`env/hotfix.js`),
      keeping the tag form untouched
- [x] Tests: fork point, header round-trip, tag-based flow byte-identical with
      the key unset (stays-silent); run `pnpm test` — green before done
