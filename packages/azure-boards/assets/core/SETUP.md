# Setting up Azure Boards sync (one-way)

A start-to-finish guide to getting `/spec-status` and `/spec-push` working
against a real Azure DevOps organization. Sync is **one-way**: the repo is the
source of truth and the linked **work item** is a **generated mirror** —
content is pushed up, never read back or merged. A spec is a work item and each
phase a **child work item**, with the phase's tasks mirrored into that child's
description as a markdown checklist (read-only — the repo wins). Covers the
**Azure side** (credentials, finding your project) that the config reference
(`azure-boards.config.md`) assumes you already have.

> The whole feature is **opt-in**: until `specs/.core/azure-boards.config.json`
> exists, everything below is inert and the package behaves exactly like the
> base `@skitterbyte/skitterspec`.

Two things about Azure Boards shape everything below:

- **Descriptions are MARKDOWN**, written verbatim with the format declared
  beside the field (`multilineFieldsFormat`) — so a read-back is normally the
  pushed text byte for byte, and task checkboxes render natively. A field saved
  as markdown cannot revert to HTML (Azure's rule; fine one-way). Items that
  predate the link read back as HTML and are reduced to text for comparison.
- **States are written directly** — there is no transition API — and a process
  rule refuses an unknown name only **at write time**, after the description
  has landed. The engine therefore validates every configured state up front
  and refuses loudly (naming what the types DO have) before anything writes.

---

## 1. Install the package

Install the Azure Boards superset (or, if you already run the base or another
superset, switch — every distribution contains the entire base, so install
exactly one):

```sh
npx @skitterbyte/skitterspec-azure-boards init
```

## 2. Credentials — a Personal Access Token

Azure DevOps authenticates REST calls with basic auth: an empty username and a
PAT as the password. Create the token in Azure DevOps under User settings →
Personal access tokens, scoped **Work Items (Read & Write)** — add
**Identity (Read)** if you want user search later (work item sync is whole
without it).

Store it in the user-level credentials store (outside every repo, `0600`),
**in your own terminal — not through an assistant**:

```sh
pnpm exec skitterspec-azure-boards spec-sync credentials set --org-url https://dev.azure.com/<org>
# Azure DevOps PAT for https://dev.azure.com/<org> (hidden): ●●●●●●●●
```

(`--org-url` keys the store entry before the repo has a config; once
`azure-boards.config.json` exists it can be omitted.)

Or export `AZURE_DEVOPS_EXT_PAT` — the official CLI's variable, so a machine
set up for `az boards` needs nothing new. The environment wins over the store.

> **MCP alternative:** with no credentials at all, the sync skills fall back to
> Microsoft's official MCP server — remote at `https://mcp.dev.azure.com/{org}`,
> or local via `@azure-devops/mcp` — authenticated with your Microsoft account.
> The engine itself never calls MCP tools; the skills fetch and hand results to
> the engine as files (`--workspace-states`, `--stored`, `--text`).

## 3. Configure — run `/spec-azure-setup`

With credentials in place, let the skill interview you:

```
/spec-azure-setup
```

It asks for the org URL, the project, the work item type names, and the four
bucket→state names — validating them against the types' real states
(`spec-sync states`) — then writes `specs/.core/azure-boards.config.json` via
`spec-sync init-config`. By hand instead:

```sh
pnpm exec skitterspec-azure-boards spec-sync init-config \
  --org-url https://dev.azure.com/<org> \
  --project <project> \
  --state complete=Done
```

**Commit the file it writes.** Spec worktrees fork from commits, so an
uncommitted `azure-boards.config.json` is invisible inside every worktree —
which is where the sync skills actually run — and sync reports itself off
there.

`azure-boards.config.md` (installed beside this file) is the full field
reference. Two defaults worth knowing: the types are the **Basic** process's
(`Issue`/`Task`) — an Agile project usually wants `User Story`/`Task`; and
`cancelled` maps to `Done` because the Basic process carries no Cancelled
state (Agile's `Removed` is an honest override).

**Map buckets to work states, not deployment stages.** The buckets mirror the
repo's work lifecycle, so To Do / Doing / Done translate honestly — On Test /
On Live do not: a finished phase would show as deployed before anything was
released. Deployment position belongs to the project's own release tooling —
`azure-boards.config.md` → **Choosing your state map** and **Releases and
deploys** carry the reasoning.

## 4. Check — `spec-sync doctor`

```sh
pnpm exec skitterspec-azure-boards spec-sync doctor --check-remote
```

Every row reports `ok`, or names the exact command that fixes it. `missing`
is an opt-in not taken (fine); `broken` is configured-but-wrong (exit 1).
`--check-remote` additionally proves the PAT reaches the org, that every
configured state exists on the types, and whether the PAT can search
identities (a warn, never broken — only user search degrades without it).

## 5. Push a spec

`/spec-push <spec>` computes the plan, applies it, stamps the returned ids
into the spec's frontmatter (`azure_identifier` / `azure_url` /
`azure_item_id`), verifies the round-trip by words, and records the snapshot
later pushes diff against. From then on the lifecycle skills keep the
mirror fresh on their own.

---

## Release smoke checklist

Re-runnable, against a real Azure DevOps org — a throwaway org/project is
ideal (the free tier covers all of it). Run before cutting a release that
touches the adapter, the dialect or the apply path. `states.json` below is the
types' state names.

1. **Doctor** — every row ok:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync doctor --check-remote
   ```

2. **States** — the types' state list:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync states --json > states.json
   ```

3. **Mint** — on a test spec with at least one phase and a task checklist:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync plan <spec> --workspace-states states.json --json > plan.json
   pnpm exec skitterspec-azure-boards spec-sync apply <spec> --plan plan.json
   ```

   In Boards: the work item and its children exist, states match the buckets,
   and the task checklist renders as markdown checkboxes.

4. **Update** — edit the spec's prose and a phase's status, then plan + apply
   again: the description is replaced and the child's state moves.

5. **Adopt + preserve** — hand-create a work item with a description (in the
   Boards UI, so it is HTML-era), stamp it onto a spec, and preserve before the
   linking push:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync stamp <spec> --issue AB#123
   pnpm exec skitterspec-azure-boards spec-sync preserve <spec>
   ```

   The original description appears as a comment headed **Original report**
   (reduced to text from its HTML); a second `preserve` reports "already
   preserved".

6. **Verify** — save a read-back (`{ "issue": "<description text>",
   "subIssues": { "<ref>": "<text>" } }`; a ref is the phase file's basename
   without `.md`, e.g. `01-date-logic` — keyed with the extension it reports
   every child as a stale ref) and:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync verify <spec> --stored readback.json
   ```

   "round-tripped intact", exit 0.

7. **Released** — over a range with `Refs:` trailers:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync released <tag>..HEAD
   ```

   Tickets counted, unreferenced commits reported, an earlier tracker's
   trailers counted as historical, bookkeeping ignored. With `--json`, each
   ticket names the spec and url behind it — what your CI uses to record a
   release.

8. **Edited description** — edit the item's description **in Boards**, fetch the item JSON,
   and:

   ```sh
   pnpm exec skitterspec-azure-boards spec-sync status <spec> --remote item.json
   ```

   The edit is reported; the next apply replaces it and says so loudly.
