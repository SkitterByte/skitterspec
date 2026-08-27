<!--
Seam fragment for the "spec-tracker-link" seam in the shared /spec skill.
The build injects this body (comment stripped) when composing the
skitterspec-linear distribution; the base distribution leaves the seam empty.
Lifted verbatim from the pre-extraction /spec "Phase E".
-->

**Only when `specs/.core/linear.config.json` exists** (Linear sync is opted in).
If it's absent, skip this phase entirely — the spec stays local-only and `/spec`
behaves exactly as above. When present, after writing the spec, link it to Linear
so status and discussion live there while the repo stays the co-authoring surface.
A spec is a Linear **issue**; each phase is a **sub-issue**; tasks are not synced:

- **Discover the Linear MCP tools at runtime** (don't hardcode names). If Linear
  isn't connected/authed, relay the fix and stop — leave the spec written and
  local; the user can link it later with `/spec-push`. Do nothing destructive.
- **Pick the Project** — run the picker in **Picking the Linear Project** below,
  then **create the Issue** from the spec: `title` from the spec title,
  `description` from the `00-overview.md` plan, `team` = `linear.teamId`, and
  `project` = the picked id (omitted when the user chose None).
- **Create a sub-issue per phase** (the `mapping.phases` target — `subissue` by
  default): a child issue with `parentId` = the spec issue, named from each phase
  file, in execution order.
- **Add the frontmatter block** to `00-overview.md` (above the `#` title) so the
  spec is linkable:

  ```yaml
  ---
  linear_identifier: "<TEAM-123>"
  linear_url: "https://linear.app/..."
  last_synced_at: "<ISO-8601 now>"
  ---
  ```

  Stamp each phase file's `linear_issue_id` with its sub-issue id. (Status is not
  stored in frontmatter — it comes from the spec's lifecycle folder.)
- **Write the initial base sidecar** so the spec starts clean and non-diverged —
  run `skitterspec spec-sync record <spec>` to capture the local snapshot as the
  committed base (`sync.baseDir`). `/spec-status` should report in-sync right after.
  (`record` is the writer; `normalize` only *prints* the projection.) Skip this
  when the spec **adopted** an existing issue — see Phase 0 — because the issue's
  description is still the reporter's, not the spec.
- **Echo the branch name** from `branch.pattern` so the user knows what `/spec-go`
  will fork.

Leave committing to the existing convention (the user commits the spec as usual)
and **never auto-push git** — Linear's own automation reacts to real branch/PR
events later. Report the Linear issue URL and the base as part of Phase C's
finish-up message.
