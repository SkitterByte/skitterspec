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
| `states.<bucket>` | The Jira STATUS name for each lifecycle bucket. Must match the project's workflow statuses exactly; moves are applied by workflow transition, and an unreachable status refuses loudly. `cancelled` defaults to `Done` because default Jira workflows carry no Cancelled status. | see example |
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
