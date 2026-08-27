# Phase 3 — `/spec-push` + `/spec-status` + seam rewritten to MCP issues ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the shipped skills apply the new plan over the Linear MCP as an issue
with parented sub-issues, stamp the right frontmatter, and validate issue
states — proven by the assets/engine-integration tests.

## Tasks

- [ ] Rewrite `packages/linear/assets/skills/spec-push/SKILL.md`:
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
- [ ] Rewrite `packages/linear/assets/skills/spec-status/SKILL.md` to report
      drift on `{issue, subIssues}` (what would create/update, and whether the
      remote issue/sub-issue workflow-state drifted).
- [ ] Update the seam `packages/linear/assets/seams/spec-tracker-link.md` (and
      any `spec-go-pull` seam) so linking a spec creates/links an **issue** and
      stores `spec_identifier`, not a project.
- [ ] Rename stored key handling everywhere: `linear_milestone_id` →
      `linear_issue_id` (phase frontmatter). Grep the assets + code for the old
      key.
- [ ] Update `packages/linear/assets/core/linear.config.md` and `SETUP.md` to
      the issue/sub-issue model, `projectId` grouping, and issue-state guidance.
- [ ] Tests: `packages/linear/test/{assets,engine-integration}.test.js` assert
      the skills reference the new MCP verbs/keys and no stale
      project/milestone/`linear_milestone_id` vocabulary remains. Run typecheck +
      tests — green before the phase is done.

## Notes

Discover MCP tools at runtime as today; the verbs shift from
`save_project`/`save_milestone` to `create_issue`/`save_issue` with `parentId`.
