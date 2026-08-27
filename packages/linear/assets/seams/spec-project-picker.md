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

1. **List the candidates.** Call the discovered project-list tool for
   `linear.teamId`. Drop archived / completed projects — they can't take new work.
2. **Offer them.** Show the names (most recently updated first is fine), plus an
   explicit **None (team only)** option. Pre-select `linear.projectId` from
   `linear.config.json` when it's set and still in the list; otherwise pre-select
   **None**.
3. **Narrow on request.** If the user types a fragment rather than choosing, filter
   the list case-insensitively by name and re-offer. Don't re-fetch.
4. **Never offer to create a project.** Projects are the PM's surface — if none
   fits, that's **None (team only)**, and someone makes the project in Linear.
5. **Pass it once.** Include `project: <chosen id>` on the issue-create call.
   Chose None → omit the key entirely (do not send an empty string).

**Degrade, never block.** If Linear isn't connected, or the server exposes no
project-list tool, say so in one line — *"project picker unavailable; creating the
issue without a project"* — and carry on with `linear.projectId` if it's set, else
no project at all. A missing picker must never fail `/spec` or `/spec-push`.

If `linear.projectId` is set but that Project is archived or missing, relay
Linear's error and stop rather than silently minting an unparented issue.
