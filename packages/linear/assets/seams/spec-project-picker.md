<!--
Seam fragment for the "spec-project-picker" seam. Injected into the shared /spec
skill (after the tracker-link steps) AND into the Linear-only /spec-push skill —
the two places a spec issue can be minted. One canonical copy of the procedure,
so the two mint points can never drift apart.
-->

### Picking the Linear Project

Run this **only when minting a spec issue** — creating it for the first time. On
an update the issue already has a project (or deliberately has none), and that
placement is **Linear's to own**: never send `project` on an update, and never
record the choice in the spec file or the snapshot. A PM re-homing a spec issue
must not show up as drift or be overwritten on the next push.

1. **List the candidates.** Ask the engine:
   `skitterspec spec-sync projects --json`. On the API path it returns the team's
   projects; on the MCP path it says so, and you call the discovered project-list
   tool instead. Drop archived / completed projects — they can't take new work.
2. **Offer them.** Show the names (most recently updated first is fine), plus an
   explicit **None (team only)** option. Pre-select `linear.projectId` from
   `linear.config.json` when it's set and still in the list; otherwise pre-select
   **None**.
3. **Narrow on request.** If the user types a fragment rather than choosing, filter
   the list case-insensitively by name and re-offer. Don't re-fetch.
4. **Never offer to create a project.** Projects are the PM's surface — if none
   fits, that's **None (team only)**, and someone makes the project in Linear.
5. **Pass it once**, to whichever thing mints the issue: `--project <chosen id>`
   on `spec-sync apply`, or `project: <chosen id>` on the MCP issue-create call.
   Chose None → omit it entirely (do not pass an empty string).

**Degrade, never block.** If the list can't be fetched — Linear not connected, no
project-list tool, no API key, or `spec-sync projects` reporting it couldn't ask —
say so in one line — *"project picker unavailable"* — and carry on with
`linear.projectId` if it's set, else no project at all. A missing picker must never fail the skill that called it.

If `linear.projectId` is set but that Project is archived or missing, relay
Linear's error and stop rather than silently minting an unparented issue.
