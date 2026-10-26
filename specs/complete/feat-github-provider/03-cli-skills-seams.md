---
linear_issue_id: "SKS-411"
github_issue_id: "#4"
---

# Phase 3 — CLI, MCP, skills, seams, intake ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec-github spec-sync` exposes the core subcommands with the
other providers' exit-code semantics; skills and all seams compose cleanly;
an existing issue can be adopted.

## Tasks

- [x] `bin/skitterspec-github.js` + `src/commands.js` on the jira pattern; the
      apply orchestration from the kit.
- [x] Subcommands: `normalize`, `plan`, `apply` (single + `--all`), `stamp`
      (verifies the issue exists when credentials resolve), `record`, `status`,
      `verify`, `doctor`, `released`, `ref`, `list`, `linked`, `states`,
      `preserve`, `credentials`, `init-config`.
- [x] `doctor`: token scopes from `X-OAuth-Scopes` (names the missing one),
      board reachable, Status field + every mapped option present, labels exist,
      config tracked by git; each cannot-tell stays silent.
- [x] MCP transport: matchers for GitHub's official MCP server, `REQUIRED`
      minimum, per-command degradation from phase 1's findings.
- [x] Intake: `--from-issue` lists issues carrying `intake.label`;
      `bugLabels`/`hotfixLabels` routing; `preserve` posts the original body as
      a comment before the linking push (idempotent by marker).
- [x] Skills: `spec-push`, `spec-status`, `spec-sync`, `spec-list`,
      `spec-github-setup` (interview → validate token, repo, board, Status
      options, labels → write `github.config.json`; offers to create missing
      labels, never the board).
- [x] Seam fragments for all 9 names, the project picker filled with the
      one-board-per-repo line; `assets/rules/commit-trailers.md` github
      edition (`Refs: #123`, closing keywords banned).
- [x] CLI tests mirroring jira's: exit codes, unknown-flag refusal, help, state
      gate, stamp validation, preserve idempotence, adoption + routing.
      Full workspace suite green.

## Notes (built)

- `bin/skitterspec-github.js`, `src/commands.js`, `src/cli-sync.js` on the
  jira pattern; `src/mcp.js` discovers the official server's tools
  (`issue_read`, `issue_write`, `sub_issue_write`, `projects_*`, `get_me`),
  host-prefixed or not.
- **State is two writes per issue in `applyOps.settle`:** the board Status by
  name, then open/closed from the BUCKET (`closeReasonForBucket`, no name
  ambiguity), each skipped when already right.
- **Intake is an engine command here** (`spec-sync intake [query]`), where
  jira's seam lists over MCP: open issues under `intake.label`, minus adopted
  ones and spec/phase-labelled ones, each routed hotfix-first.
- `list` reads the BOARD (`listBoardItems`, this repo's issues only); new
  adapter ops `listBoardItems` and `listIssues`.
- `released` passes `GITHUB_REF_RE` and treats `KEY-N` as historical.
- The adapter's post-create link failure carries `orphan`, not `created` — the
  kit's apply accounting overwrites `created` on every error it sees.
- **Found in passing, not fixed here:** jira's bare `spec-sync ref` crashes
  (`currentBranch(dir)` where a git reader belongs — "git is not a function");
  the github copy is fixed and tested. See the Changelog follow-up.
- Skills, 9 seams and `commit-trailers.md` (closing keywords and cross-repo
  refs banned) adapted from jira's; `SETUP.md` rewritten with a 9-step smoke.
