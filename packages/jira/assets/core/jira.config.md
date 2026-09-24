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
| `release.stages` / `release.ignorePaths` | The deployment ladder and bookkeeping path prefixes, exactly as the Linear provider defines them. | `[]` / `specs/`, changelogs |

Descriptions are stored as ADF (Atlassian Document Format): the adapter
renders markdown to ADF on push and reduces ADF back to text on read-back, so
verification compares words, not bytes. Phase checklists render as live ADF
task lists — still a read-only mirror: a box ticked in Jira is overwritten on
the next push.

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
  hub, the analogue of what `spec-sync released` computes from `Refs:`
  trailers.
- **Let CI/CD integrations stamp environment position** (the deployments
  panel), so it never needs to be a status at all.

Walking the parent through pipeline stages at *release* time is the
`release.stages` ladder — deferred in this provider's v1 — not a job for the
lifecycle skills.
