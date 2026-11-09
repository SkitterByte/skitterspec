---
github_identifier: "#140"
github_url: "https://github.com/SkitterByte/skitterspec/issues/140"
---

# A skitterspec project in a subfolder of the git root

> **Type:** Feature
> **Name:** feat-subfolder-project (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/140
> **Author:** Reuben Greaves
> **Raised:** 2026-11-09
> **Area:** packages/common/src/env/project.js (new), packages/common/src/env/{resolve,config,review,serve,classify,mainguard,bootstrap,provision,dev,handoff}.js, packages/common/src/{cli,init}.js, packages/common/assets/hooks/*.cjs, packages/{azure-boards,github,jira,linear,provider-kit,sync-core}/src, packages/common/assets/core/{SETUP.md,env.config.md}, .github/workflows/ci.yml, scripts/build-dist.js output
> **Stack:** worktree
> **Docs:** reference

## Summary

skitterspec works when its project folder (`specs/`, `.claude/`) sits in a
subfolder of the git repo instead of at its root — with isolation, worktrees,
the review page, the guards and every tracker provider — and behaves exactly as
today when the project is at the root.

## Problem

An Azure DevOps adopter's git root (`C:\Code\LSC App`) holds `FF.CSC.Solution/`
beside `Sql/` and two prototypes; sessions start in `FF.CSC.Solution/`, so
`.claude/` and `specs/` must live there. With isolation off that already works.
With isolation on it breaks: `resolvePrimaryCheckout` re-anchors to the git root
and reads no `env.config.json` ("isolation not enabled"), worktree paths are
built as `<wt>/specs/…`, repo-relative matchers assume `specs/` at the root and
**silently** misclassify spec docs, the main guard silently allows every write,
and `../{repo}-wt` lands worktrees inside the repo.

## Acceptance criteria

- From `FF.CSC.Solution/` (or any folder beneath it), every `spec-env` verb
  finds the config and resolves specs; `skitterspec status` and
  `spec-env resolve` print the detected project folder.
- `/spec-start` provisions a worktree beside the repo (`…/LSC App-wt/<spec>`),
  runs setup and dev servers in `<wt>/FF.CSC.Solution`, and moves the session
  there.
- The review page classifies the spec's docs as spec docs and shows changes
  outside the project folder (e.g. `Sql/`) as code.
- The main guard refuses a write anywhere in the primary checkout on the base
  branch; the review-gate hook refuses a commit in the spec's worktree.
- `skitterspec init` run in a subfolder produces a working install.
- The full suite is green unchanged, and green again with the project nested,
  on ubuntu and windows-latest.

## Decisions

1. **Find the project by walking up to `specs/.core/`**, stopping at the git
   toplevel; `prefix` = that folder relative to the toplevel, `''` when none is
   found (today's behaviour). Rejected `git rev-parse --show-prefix`: it is the
   *invocation* folder, so a root-layout user running from `packages/common`
   would get a wrong prefix — a regression of the `''` case. Rejected a config
   key: the config lives in the folder being located.
2. **One module, `env/project.js`, and every site routes through it**:
   `locateProject(cwd)` → `{ gitRoot, prefix, projectDir }`;
   `projectIn(root)` → `join(root, prefix)`; `fromRepoPath(rel)` → the
   project-relative path or `null` outside the prefix; `toRepoPath(rel)`.
   Repo-relative paths are posix (`/`) throughout; OS paths only at `fs`/`spawn`.
3. **Normalise git output to root-relative before converting.** `diff
   --name-only` / `status --porcelain` are root-relative, `ls-files` is
   cwd-relative — use `--full-name` or `git -C <root>`, never mix.
4. **`worktree.root` resolves against the git root, and `{repo}` is the git
   root's name** — `../{repo}-wt` → `C:\Code\LSC App-wt\<spec>`, the project at
   `<wt>/FF.CSC.Solution`. Identical to today at prefix `''`.
5. **Everything in `env.config.json` is project-relative**: setup, dev servers,
   `docker.composeFile`, env/seed files, the registry, and the folder the
   session moves into all use `projectIn(<wt>)`. Git operations stay at the
   worktree root. A per-step `cwd` is not added.
6. **The main guard covers the whole primary checkout**, not just the prefix: a
   write to `Sql/` on the base branch is still unreviewed work. It compares the
   target's toplevel against the primary *root*, so the subfolder no longer
   makes it fail open.
7. **The review diff stays repo-wide.** Changes outside the prefix are code;
   only paths inside it can be spec docs or `.spec-env/` noise.
8. **All providers are covered** (azure-boards, github, jira, linear,
   provider-kit, sync-core): a half-fixed provider fails silently. Distribution
   packages pick it up through `scripts/build-dist.js`.
9. **Proof is a nested rerun, not a list.** The shared git-fixture builder
   honours `SKITTERSPEC_TEST_PREFIX`; `test:nested` reruns every git-backed
   env/CLI test with the project nested, and CI runs both suites on ubuntu and
   windows-latest (`core.longpaths` on). Each accusing check gets a stays-silent
   test on the nested layout (`.claude/rules/negative-checks.md`).
10. **The prefix is reported, not configured**: one `subfolder:` line in
    `spec-env resolve` and at the top of `skitterspec status`, only when the
    prefix is non-empty. No `doctor` verb.
11. **Out of scope:** several skitterspec projects in one repo (find-up picks
    the nearest; nothing arbitrates between two).

## Solution overview

`locateProject` runs once per invocation. The primary checkout becomes
`projectIn(resolvePrimaryRoot())`, so `loadEnvConfig`, the registry and spec
lookup read the subfolder; worktree coordinates come from the root. Worktree-side
code swaps `<wt>/specs` for `projectIn(<wt>)/specs`. Matchers take root-relative
git paths, convert with `fromRepoPath`, and test the result against `specs/` —
a `null` (outside the project) is code. Hooks already receive the subfolder as
`CLAUDE_PROJECT_DIR`; `findEngine` walks up from there to `node_modules`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Service | add | `env/project.js` — locateProject, projectIn, fromRepoPath, toRepoPath |
| Service | update | resolvePrimaryCheckout, loadEnvConfig, worktree.root / `{repo}` expansion |
| CLI command | update | spec-env handoff, stage, review, bootstrap, up, dev, resolve; `status`, `init` |
| Business rule | update | spec-doc / noise / foreign classification (review, serve, classify) |
| Business rule | update | main guard primary-checkout test; review-gate hook |
| Config key | update | provider `ignorePaths` / spec discovery made prefix-aware |
| CLI output | add | `subfolder: <prefix>/ (in repo <root>)` line in resolve + status |
| CI | add | windows-latest job; `test:nested` script |
| Docs | update | SETUP.md, env.config.md, docs/reference.html |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Locate the project, re-anchor, nested test harness + Windows CI | ✅ | [01-locate-and-anchor.md](01-locate-and-anchor.md) |
| 2 | Worktree side: paths, setup/dev/docker cwd, session move | ✅ | [02-worktree-side.md](02-worktree-side.md) |
| 3 | Repo-relative matching: review, serve, stage | ✅ | [03-path-matching.md](03-path-matching.md) |
| 4 | Guards and hooks | ✅ | [04-guards-and-hooks.md](04-guards-and-hooks.md) |
| 5 | Providers and init | ⬜ | [05-providers-and-init.md](05-providers-and-init.md) |
| 6 | Docs and dist | ⬜ | [06-docs-and-dist.md](06-docs-and-dist.md) |

## Open questions

- None

## Changelog

- 2026-11-09 — Spec created from an adopter's report (Azure DevOps, .NET 4.8
  solution in a subfolder). Grill replaced `--show-prefix` with find-up to
  `specs/.core/` (decision 1).
- 2026-11-09 — Decision 9 amended: there was no shared fixture builder to
  teach a prefix. A new `test/helpers/repo.js` takes it, and each phase moves
  the tests for the sites it touches onto the helper; `test:nested` reruns
  every file that uses it.
- 2026-11-09 — Decision 10 amended: the line is `subfolder:`, not `project:`
  — `spec-env resolve` already prints `project:` for the docker project name.
- 2026-11-09 — Windows CI: `test:nested` gates; the full suite runs with
  `continue-on-error`, since it has never run on Windows and may be red there
  for reasons unrelated to this spec.
- 2026-11-09 — Phase 2: the `worktree:` line names the project folder inside
  the worktree (identical at prefix ''), since that is where a session stands
  and what `/spec-next` compares against. Added `shellPath` quoting to every
  printed command — a repo named with a space (the adopter's `LSC App`) broke
  `git worktree add` regardless of nesting.
- 2026-11-09 — Phase 3: paths stay git paths on the page and inside the
  classifiers; only pathspecs handed out (stage, the `up` gate's commit,
  `docs.paths`) are made project-relative, since they run from the project
  folder.
