# Setting up Jira sync (one-way)

A start-to-finish guide to getting `/spec-status` and `/spec-push` working
against a real Jira Cloud site. Sync is **one-way**: the repo is the source of
truth and the linked Jira **issue** is a **generated mirror** — content is
pushed up, never read back or merged. A spec is a Jira issue and each phase a
**subtask**, with the phase's tasks mirrored into that subtask's description as
a live (but read-only — the repo wins) ADF checklist. Covers the **Jira side**
(credentials, finding your project) that the config reference
(`jira.config.md`) assumes you already have.

> The whole feature is **opt-in**: until `specs/.core/jira.config.json` exists,
> everything below is inert and the package behaves exactly like the base
> `@skitterbyte/skitterspec`.

Two things about Jira Cloud shape everything below:

- **Descriptions are ADF** (Atlassian Document Format), not markdown. The
  adapter converts markdown at the boundary in both directions, and every
  verification compares **words, not bytes**.
- **Statuses move by workflow transition** — there is no "set status". The
  engine resolves the transition that lands on the configured status and
  refuses loudly (naming what IS available) when none does. It never
  path-finds a workflow.

---

## 1. Install the package

Install the Jira superset (or, if you already run the base or the Linear
superset, switch — every distribution contains the entire base, so install
exactly one):

```sh
npx @skitterbyte/skitterspec-jira init
```

## 2. Credentials — an email + API-token pair

Jira Cloud authenticates REST calls with basic auth: your Atlassian account
email plus an API token. Create the token at
<https://id.atlassian.com/manage-profile/security/api-tokens>.

Store the pair in the user-level credentials store (outside every repo,
`0600`), **in your own terminal — not through an assistant**:

```sh
pnpm exec skitterspec-jira spec-sync credentials set
# Jira account email for https://<site>.atlassian.net: you@example.com
# Jira API token for you@example.com (hidden): ●●●●●●●●
```

Or export `JIRA_EMAIL` and `JIRA_API_TOKEN` (both — an email without a token
authenticates nothing). The environment wins over the store.

> **MCP alternative:** with no credentials at all, the sync skills fall back to
> Atlassian's official remote MCP server — `claude mcp add --transport http
> atlassian https://mcp.atlassian.com/v1/sse`, then authenticate via `/mcp`.
> The engine itself never calls MCP tools; the skills fetch and hand results to
> the engine as files (`--workspace-states`, `--stored`, `--text`).

## 3. Configure — run `/spec-jira-setup`

With credentials in place, let the skill interview you:

```
/spec-jira-setup
```

It asks for the site URL, the project key, the issue and subtask type names,
and the four bucket→status names — validating them against the project's real
statuses (`spec-sync states`) — then writes `specs/.core/jira.config.json`
via `spec-sync init-config`. By hand instead:

```sh
pnpm exec skitterspec-jira spec-sync init-config \
  --site-url https://your-site.atlassian.net \
  --project-key PROJ \
  --state complete=Done
```

`jira.config.md` (installed beside this file) is the full field reference.
Two defaults worth knowing: the issue type is `Task` and the subtask type
`Subtask` — site admins rename these, so check yours; and `cancelled` maps to
`Done` because default Jira workflows carry no Cancelled status.

## 4. Check — `spec-sync doctor`

```sh
pnpm exec skitterspec-jira spec-sync doctor --check-remote
```

Every row reports `ok`, or names the exact command that fixes it. `missing`
is an opt-in not taken (fine); `broken` is configured-but-wrong (exit 1).
`--check-remote` additionally proves the credentials reach the site and that
every configured status exists in the project's workflows.

## 5. Push a spec

`/spec-push <spec>` computes the plan, applies it, stamps the returned keys
into the spec's frontmatter (`jira_identifier` / `jira_url` /
`jira_issue_id`), verifies the round-trip by words, and records the snapshot
later drift is measured against. From then on the lifecycle skills keep the
mirror fresh on their own.

---

## Release smoke checklist

Re-runnable, against a real Jira Cloud site — a throwaway project is ideal.
Run before cutting a release that touches the adapter, the ADF layer or the
apply path. `states.json` below is the project's status names.

1. **Doctor** — every row ok:

   ```sh
   pnpm exec skitterspec-jira spec-sync doctor --check-remote
   ```

2. **States** — the project's statuses list:

   ```sh
   pnpm exec skitterspec-jira spec-sync states --json > states.json
   ```

3. **Mint** — on a test spec with at least one phase and a task checklist:

   ```sh
   pnpm exec skitterspec-jira spec-sync plan <spec> --workspace-states states.json --json > plan.json
   pnpm exec skitterspec-jira spec-sync apply <spec> --plan plan.json
   ```

   In Jira: the issue and its subtasks exist, statuses match the buckets, and
   the task checklist renders as live checkboxes. (If a surface renders the
   task list as plain text, the renderer has a `taskLists: false` fallback —
   file it.)

4. **Update** — edit the spec's prose and a phase's status, then plan + apply
   again: the description is replaced and the subtask's status transitions.

5. **Adopt + preserve** — hand-create an issue with a description, stamp it
   onto a spec, and preserve before the linking push:

   ```sh
   pnpm exec skitterspec-jira spec-sync stamp <spec> --issue PROJ-123
   pnpm exec skitterspec-jira spec-sync preserve <spec>
   ```

   The original description appears as a comment headed **Original report**;
   a second `preserve` reports "already preserved".

6. **Verify** — save a read-back (`{ "issue": "<description text>",
   "subIssues": { "<ref>": "<text>" } }`) and:

   ```sh
   pnpm exec skitterspec-jira spec-sync verify <spec> --stored readback.json
   ```

   "round-tripped intact", exit 0.

7. **Released** — over a range with `Refs:` trailers:

   ```sh
   pnpm exec skitterspec-jira spec-sync released <tag>..HEAD
   ```

   Tickets counted, unreferenced commits reported, bookkeeping ignored.

8. **Drift** — edit the issue's description **in Jira**, fetch the issue JSON,
   and:

   ```sh
   pnpm exec skitterspec-jira spec-sync status <spec> --remote issue.json
   ```

   The edit is reported; the next apply replaces it and says so loudly.
