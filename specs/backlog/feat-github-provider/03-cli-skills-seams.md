---
linear_issue_id: "SKS-411"
---

# Phase 3 — CLI, MCP, skills, seams, intake ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec-github spec-sync` exposes the core subcommands with the
other providers' exit-code semantics; skills and all seams compose cleanly;
an existing issue can be adopted.

## Tasks

- [ ] `bin/skitterspec-github.js` + `src/commands.js` on the jira pattern; the
      apply orchestration from the kit.
- [ ] Subcommands: `normalize`, `plan`, `apply` (single + `--all`), `stamp`
      (verifies the issue exists when credentials resolve), `record`, `status`,
      `verify`, `doctor`, `released`, `ref`, `list`, `linked`, `states`,
      `preserve`, `credentials`, `init-config`.
- [ ] `doctor`: token scopes from `X-OAuth-Scopes` (names the missing one),
      board reachable, Status field + every mapped option present, labels exist,
      config tracked by git; each cannot-tell stays silent.
- [ ] MCP transport: matchers for GitHub's official MCP server, `REQUIRED`
      minimum, per-command degradation from phase 1's findings.
- [ ] Intake: `--from-issue` lists issues carrying `intake.label`;
      `bugLabels`/`hotfixLabels` routing; `preserve` posts the original body as
      a comment before the linking push (idempotent by marker).
- [ ] Skills: `spec-push`, `spec-status`, `spec-sync`, `spec-list`,
      `spec-github-setup` (interview → validate token, repo, board, Status
      options, labels → write `github.config.json`; offers to create missing
      labels, never the board).
- [ ] Seam fragments for all 9 names, the project picker filled with the
      one-board-per-repo line; `assets/rules/commit-trailers.md` github
      edition (`Refs: #123`, closing keywords banned).
- [ ] CLI tests mirroring jira's: exit codes, unknown-flag refusal, help, state
      gate, stamp validation, preserve idempotence, adoption + routing.
      Full workspace suite green.
