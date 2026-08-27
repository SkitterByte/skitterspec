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
A spec is a Linear **issue**; each phase is a **sub-issue**, carrying that
phase's tasks in its description as a read-only checklist:

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
- **Stamp the ids** so the spec is linkable — one call, no hand-edited
  frontmatter:

  ```
  skitterspec spec-sync stamp <spec> \
    --issue TEAM-123 --url https://linear.app/… \
    --sub 01-<slug>=TEAM-124 --sub 02-<slug>=TEAM-125
  ```

  It writes `linear_identifier`/`linear_url` onto `00-overview.md` and each phase
  file's `linear_issue_id`, validating every ref and id **before** touching a
  file — on any problem it changes nothing and exits non-zero, so a typo can't
  leave the spec pointing at an issue that isn't there. (Status is not stored in
  frontmatter — it comes from the spec's lifecycle folder.)
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
