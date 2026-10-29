# `jira.config.json` — field reference

The committed, shareable half of Jira sync. It holds ids, names and env-var
NAMES — never a credential. Credentials live in the user-level store
(`skitterspec-jira spec-sync credentials set`) or the environment.

| Key | Meaning | Default |
|-----|---------|---------|
| `jira.siteUrl` | The Jira Cloud site (`https://<site>.atlassian.net`). Also keys the credentials-store entry. | `""` |
| `jira.projectKey` | Where spec issues land — the identifier prefix (`PROJ-123`). Jira's project is the analogue of Linear's team; placement is decided here, once. | `""` |
| `jira.issueType` | The issue type a spec mints as. | `"Task"` |
| `jira.subtaskType` | The type a phase mints as (must be a subtask type). | `"Subtask"` |
| `mapping.specFolder` / `mapping.phases` / `mapping.tasks` | Spec → issue, phase → subtask, tasks → ADF checklist. Same modes as the Linear provider (`subissue` \| `deferred` \| `inline`; `checklist` \| `none`). | `issue` / `subissue` / `checklist` |
| `states.<bucket>` | The Jira STATUS name for each lifecycle bucket. Must match the project's workflow statuses exactly; moves are applied by workflow transition, and an unreachable status refuses loudly. `cancelled` defaults to `Done` because default Jira workflows carry no Cancelled status. Pick work statuses, not pipeline stages — see **Choosing your status map** below. | see example |
| `auth.emailEnv` / `auth.tokenEnv` | Env-var NAMES for the email + API-token pair (basic auth). | `JIRA_EMAIL` / `JIRA_API_TOKEN` |
| `apply.transport` | `api` \| `mcp`, or empty for "api when credentials resolve, mcp when they don't". | `""` |
| `sync.baseDir` | Where last-pushed snapshots live. | `specs/.core/jira-base` |
| `sync.fieldOwnership` | Which projection fields push (`description`, `subIssues`, `workflowState`, `assignee`; `"none"` declines one). | all `push` |
| `release.ignorePaths` | Bookkeeping path prefixes `released` ignores, exactly as the Linear provider defines them. | `specs/`, changelogs |

Descriptions are stored as ADF (Atlassian Document Format): the adapter
renders markdown to ADF on push and reduces ADF back to text on read-back, so
verification compares words, not bytes. Phase checklists render as live ADF
task lists — still a read-only mirror: a box ticked in Jira is overwritten on
the next push.

## More than one name per bucket — read-only aliases

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
- **The rest are read as that bucket** wherever a listing interprets a status.
  The array is parsed and validated like every other provider's, so one config
  shape works across all of them. `spec-sync status` never reads a ticket's
  status at all: skitterspec tells Jira about its own transitions and nothing
  else.
- **Nothing is pulled.** An alias changes what the report *says* about a
  ticket, never the spec.
- A plain string works exactly as before. An alias that also names another
  bucket is refused at load. An alias the tracker lacks is reported by
  `spec-sync states` but never blocks a push, because it is never written.

## Choosing your status map

Map the four buckets to **work** statuses, never to deployment stages. The
buckets mirror the repo's work lifecycle — folder buckets for the spec, phase
emoji for each subtask — so they translate honestly to To Do / In Progress /
Done and never to a pipeline (On Test → On Live): the repo learns where work
**is** as it happens, but it learns what **shipped** only when a release is
cut, so a pipeline status driven from the spec lifecycle is wrong the moment
it moves. The tell is the subtasks: a finished phase transitioned to `On Live`
before anything was released is the mapping asking status to carry two
different state machines.

If your workflow encodes a deployment pipeline, three standard Jira moves keep
the map honest:

- **Give subtasks their own workflow.** A workflow *scheme* can assign the
  subtask type a plain To Do / In Progress / Done workflow while the parent
  type keeps the pipeline — subtasks genuinely have no delivery lifecycle, and
  Jira lets you say so structurally.
- **Track "which release contains this" with fix versions** — the Releases
  hub. Your CI can fill it from `spec-sync released "<prev>..<tag>" --json`,
  which lists the tickets a range contains from their `Refs:` trailers, each
  with its spec and url. (Available on every plan; in the current "Spaces" UI it is not a
  Features toggle but a **tab** — add it with `+` in the space's tab bar.)
- **Let CI/CD integrations stamp environment position** (the deployments
  panel), so it never needs to be a status at all.

**Seeing the map is one command:** `spec-sync states` renders every bucket
against the live project — the configured status, a verdict per row with the
status's board category, the closest match when one is missing, and the
one-line remap. Run it whenever the wiring feels uncertain; it changes
nothing.

Walking the parent through pipeline stages at *release* time is the host
project's job, not skitterspec's: it writes nothing about releases or
deployments on any provider. A leftover `release.stages` is flagged by
`spec-sync doctor` as unused config.
