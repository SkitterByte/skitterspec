# Phase 3 — `/spec-push` + `/spec-status` + seam rewritten to MCP issues ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the shipped skills apply the new plan over the Linear MCP as an issue
with parented sub-issues, stamp the right frontmatter, and validate issue
states — proven by the assets/engine-integration tests.

## Tasks

- [x] Rewrite `packages/linear/assets/skills/spec-push/SKILL.md`:
      - Get the plan (`spec-sync push <spec> --json`) in the new shape.
      - Validate configured `states` against the workspace's **issue** workflow
        states before writing; stop and fix config on mismatch.
      - Apply order: (1) create the **spec issue** via `create_issue`
        (team = `teamId`; set `projectId` if configured; description + state) and
        stamp `spec_identifier` into the overview; (2) create each **sub-issue**
        via `create_issue` with `parentId` = the spec issue, stamping
        `linear_issue_id` into the phase file (`ref` = phase basename); (3)
        updates via `save_issue` by `id`; map state buckets through
        `config.states`.
      - If `projectId` is set but the Project is archived/missing, relay Linear's
        error and stop, writing nothing.
      - Record the snapshot (`spec-sync record <spec>`), commit stamped files.
- [x] Rewrite `packages/linear/assets/skills/spec-status/SKILL.md` to report
      drift on `{issue, subIssues}` (what would create/update, and whether the
      remote issue/sub-issue workflow-state drifted).
- [x] Update the seam `packages/linear/assets/seams/spec-tracker-link.md` (and
      any `spec-go-pull` seam) so linking a spec creates/links an **issue** and
      stores `spec_identifier`, not a project.
- [x] Rename stored key handling everywhere: `linear_milestone_id` →
      `linear_issue_id` (phase frontmatter). Grep the assets + code for the old
      key. (Engine already renamed `stampMilestoneId` → `stampSubIssueId`.)
- [x] Reconcile the spec-issue identifier key: the engine keys the snapshot on
      `linear_identifier`. Stamp the created spec issue's id into that same key
      (not a new `spec_identifier`), and fix decision 7 in the overview to match.
- [x] Update `packages/linear/assets/core/linear.config.md` and `SETUP.md` to
      the issue/sub-issue model, `projectId` grouping, and issue-state guidance.
- [x] Tests: `packages/linear/test/{assets,engine-integration}.test.js` assert
      the skills reference the new MCP verbs/keys and no stale
      project/milestone/`linear_milestone_id` vocabulary remains. Run typecheck +
      tests — green before the phase is done.

## Notes

Discover MCP tools at runtime as today; the verbs shift from
`save_project`/`save_milestone` to `save_issue` (upsert) with `parentId` for
sub-issues.

Also reshaped `src/mcp.js` (the MCP-boundary adapter + matchers) and its test
from project/milestone ops to issue/sub-issue ops (`issueRead`/`issueCreate`/
`issueUpdate`/`issueList`, REQUIRED = issueRead+issueCreate; adapter gains
`createSubIssue`/`updateSubIssue`/`listSubIssues`). It isn't wired into the
skills (agents call MCP directly) but is the canonical model of the boundary, so
it must match. Tightened the `issueList` matcher so singular `get_issue` can't
greedily claim it. The vendored `skitterspec-linear/src/vendor/**` copy is a
gitignored build artifact — Phase 4 rebuilds it. 419 tests green.
