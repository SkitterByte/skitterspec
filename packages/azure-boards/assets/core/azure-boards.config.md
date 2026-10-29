# `azure-boards.config.json` — field reference

The committed, shareable half of Azure Boards sync. It holds ids, names and
env-var NAMES — never a credential. Credentials live in the user-level store
(`skitterspec-azure-boards spec-sync credentials set`) or the environment.

| Key | Meaning | Default |
|-----|---------|---------|
| `azure.orgUrl` | The organization (`https://dev.azure.com/<org>`). Also keys the credentials-store entry. | `""` |
| `azure.project` | The project spec work items land in. | `""` |
| `azure.workItemType` | The work item type a spec mints as. Types are process-defined (Basic: `Issue`; Agile: `User Story`; custom anything), so this is config, not a constant. | `"Issue"` |
| `azure.workItemTypeByKind` | The mint type per spec kind — `feature`, `bug`, `hotfix`, read off the spec folder's prefix — falling back to `azure.workItemType`. In Agile/Scrum/CMMI a bug is a type, so `{ "bug": "Bug", "hotfix": "Bug" }` keeps `/spec-bug` and `/spec-hotfix` out of the story backlog. Each named type's states are validated like the base pair's. | `{}` |
| `azure.childType` | The type a phase mints as, linked parent/child under the spec's item. | `"Task"` |
| `azure.areaPath` | Optional area path for minted items; empty means the project default. | `""` |
| `azure.backlogOrderField` | The field `spec-sync list --next` ranks the backlog by, ascending. StackRank is what Basic, Agile and CMMI backlogs drag-order; a Scrum process uses `Microsoft.VSTS.Common.BacklogPriority`. | `Microsoft.VSTS.Common.StackRank` |
| `mapping.specFolder` / `mapping.phases` / `mapping.tasks` | Spec → work item, phase → child item, tasks → markdown checklist. Same modes as the other providers (`subissue` \| `deferred` \| `inline`; `checklist` \| `none`). | `issue` / `subissue` / `checklist` |
| `states.<bucket>` | The Boards STATE name for each lifecycle bucket, per the project's own process. Moves are direct `System.State` writes; a state the process refuses is a named refusal listing the states the type has. `cancelled` defaults to `Done` because the Basic process carries no Cancelled state. | see example |
| `intake.tag` / `intake.bugTags` / `intake.hotfixTags` | Intake routes an adopted work item by its tags (Boards has tags, not labels): the inbox filter, and the routes to `/spec-bug` and `/spec-hotfix`. Empty lists route nothing. | `""` / `["bug"]` / `[]` |
| `intake.bugTypes` / `intake.hotfixTypes` | The same routes, keyed on the item's work item TYPE — in Agile/Scrum/CMMI a bug is a type, not a tag, so an untagged `Bug` still reaches `/spec-bug`. A match on either axis routes, hotfix wins over bug, and an explicit `[]` opts type routing out. | `["Bug"]` / `[]` |
| `auth.tokenEnv` | The env-var NAME for the PAT — the official CLI's by default, so a machine set up for `az boards` needs nothing new. Work Items (Read & Write) covers everything but identity search, which wants Identity (Read). | `AZURE_DEVOPS_EXT_PAT` |
| `refs.foreignPatterns` | Ref shapes that are KNOWN HISTORY rather than unreferenced commits — a repo migrating off another tracker lists its old key here (e.g. `"ERQ-\\d+"`). | `[]` |
| `releases.workItemType` / `releases.series` | The release seam's carrier: one work item of this type per release, found by title, its state moved through each series' `envs` map by `release deployed`. | `"Release"` / `[]` |
| `releases.ticketTag` | Tag each ticket `release create` attaches with the release tag (`v37.7.0`), so a story card shows which release carried it and the board filters by it. Existing tags are kept. The tag is checked per ticket, separately from the link, so re-running `release create <tag> --apply` backfills a release cut before this existed — without a second comment. `false` opts out. | `true` |
| `releases.deployedField` | A field reference (e.g. `Custom.Deployed`) that `release deployed <env>` sets on each ticket the release carries, to that env's `envs` value — the same name the release item moves to. Phase Tasks and ticket State are never touched. The value is checked against each ticket type's allowed values before anything is written, so a type without the field or a value its picklist lacks refuses with nothing changed. Empty writes no field. `SETUP.md` → *see releases on the board*. | `""` |
| `apply.transport` | `api` \| `mcp`, or empty for "api when credentials resolve, mcp when they don't". | `""` |
| `sync.baseDir` | Where last-pushed snapshots live. | `specs/.core/azure-base` |
| `sync.fieldOwnership` | Which projection fields push (`description`, `subIssues`, `workflowState`, `assignee`; `"none"` declines one). | all `push` |
| `release.stages` / `release.ignorePaths` | The deployment ladder and bookkeeping path prefixes, exactly as the other providers define them. | `[]` / `specs/`, changelogs |

Descriptions are stored as MARKDOWN: the adapter writes the projection's
markdown verbatim and declares the format beside the field
(`multilineFieldsFormat`), so a read-back is byte-comparable and task
checkboxes render natively. A field saved as markdown cannot revert to HTML —
Azure's rule, and fine one-way: this provider never writes HTML. Work items
that predate the link (every intake-adopted item) come back as HTML and are
reduced to text for comparison and preservation, never written back.

A box ticked in Boards is still overwritten on the next push — the mirror is
read-only, exactly as the other providers' are.

## Choosing your state map

Map the four buckets to **work** states, never to deployment stages — the
same rule the Jira reference explains at length. The repo learns where work
**is** as it happens, but what **shipped** only when a release is cut, so a
pipeline state driven from the spec lifecycle is wrong the moment it moves.
Deployment position belongs to the release seam (`releases.series[].envs`,
moving the release work item), not to each ticket's state.

### More than one name per bucket — read-only aliases

A board usually has more states than the four buckets: "Blocked", "Next
Sprint", "Released". A bucket's value may be an **array** instead of a string:

```jsonc
"states": {
  "in-progress": ["Active", "Blocked"],
  "complete": ["Closed", "Released"]
}
```

- **The first name is the only one push writes**, and only when the spec
  itself moves. The rest are never written.
- **The rest are read as that bucket** wherever a tracker state is
  interpreted: `spec-sync status` reports no drift for them, the live
  `spec-sync list` hides every `complete` / `cancelled` name, and
  `spec-sync states` lists each alias under its bucket.
- **Nothing is pulled.** An alias changes what the report *says* about a
  ticket, never the spec.
- A plain string works exactly as before. An alias that also names another
  bucket is refused at load. An alias the tracker lacks is reported by
  `spec-sync states` but never blocks a push, because it is never written.
- A state in no bucket at all is still reported by `spec-sync status`, as
  "a state skitterspec does not map — left alone", never as drift.
