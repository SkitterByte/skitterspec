<!--
Seam fragment for the "spec-tracker-link" seam in the shared /spec skill.
The build injects this body (comment stripped) when composing the
skitterspec-linear distribution; the base distribution leaves the seam empty.
Lifted verbatim from the pre-extraction /spec "Phase E".
-->

**Only when `specs/.core/linear.config.json` exists** (Linear sync is opted in).
If it's absent, skip this phase entirely — the spec stays local-only and `/spec`
behaves exactly as above. When present, after writing the spec, link it to Linear
so status and discussion live there while the repo stays the co-authoring surface:

- **Discover the Linear MCP tools at runtime** (don't hardcode names). If Linear
  isn't connected/authed, relay the fix and stop — leave the spec written and
  local; the user can link it later with `/spec-push`. Do nothing destructive.
- **Create the Project** from the spec: name from the title, description from the
  `00-overview.md` plan. Attach the `initiativeId` from `linear.config.json` when
  one is set.
- **Create a Milestone per phase** (the `mapping.phases` target — milestones by
  default), named from each phase file, in execution order.
- **Add the frontmatter block** to `00-overview.md` (above the `#` title) so the
  spec is linkable:

  ```yaml
  ---
  linear_project_id: "<uuid>"
  linear_identifier: "<TEAM-123>"
  linear_url: "https://linear.app/..."
  spec_status: "backlog"
  last_synced_at: "<ISO-8601 now>"
  ---
  ```

- **Write the initial base sidecar** so the spec starts clean and non-diverged —
  run `skitterspec spec-sync normalize <spec>` to capture the local snapshot as the
  committed base (`sync.baseDir`). `/spec-status` should report in-sync right after.
- **Echo the branch name** from `branch.pattern` so the user knows what `/spec-go`
  will fork.

Leave committing to the existing convention (the user commits the spec as usual)
and **never auto-push git** — Linear's own automation reacts to real branch/PR
events later. Report the Linear project URL and the base as part of Phase C's
finish-up message.
