# Setting up Linear sync (one-way)

A start-to-finish guide to getting `/spec-status` and `/spec-push` working against
a real Linear workspace. Sync is **one-way**: the repo is the source of truth and
the linked Linear **issue** is a **generated mirror** — content is pushed up, never
read back or merged. A spec is a Linear issue and each phase a sub-issue; tasks are
not synced. Covers the **Linear side** (connecting the MCP server, finding your
team) that the config reference (`linear.config.md`) assumes you already have.

> The whole feature is **opt-in**: until `specs/.core/linear.config.json` exists,
> everything below is inert and the package behaves exactly like the base
> `@skitterbyte/skitterspec`.

---

## 1. Install the package

Install the Linear superset (or, if you already run the base, switch to it — it
contains the entire base, so install one **or** the other, never both):

```sh
npx @skitterbyte/skitterspec-linear init
```

## 2. Connect the Linear MCP server

The sync skills talk to Linear over MCP. Add Linear's official remote server and
authenticate — this is a one-time, per-machine step.

```sh
claude mcp add --transport http linear https://mcp.linear.app/mcp
```

Then, **inside Claude Code**, authenticate (a browser window opens for OAuth —
pick the workspace you want to sync into):

```
/mcp        →  select "linear"  →  Authenticate
```

A newly added server only appears in `/mcp` **after Claude Code restarts** — if
you don't see `linear`, relaunch with `claude --continue` and try again.

Verify it's connected:

```sh
claude mcp list
# linear: https://mcp.linear.app/mcp (HTTP) - ✓ authenticated
```

> Read-only trial: use `https://mcp.linear.app/mcp/readonly` to exercise
> `/spec-status` (drift report) without granting write access. `/spec-push`
> needs the full (writable) endpoint.

## 3. Find your team id

`linear.config.json` needs your Linear **team UUID**. The easiest way is to just
ask Claude once the MCP server is connected:

> "List my Linear teams with their ids."

It calls the Linear `list_teams` tool and returns rows like:

```
Skitterspec — e07c2b54-dcf6-4b6e-81bd-175a9bc79868  (key: SKI)
```

Copy the `id` (the UUID). The `key` (e.g. `SKI`) is the short human handle. If most
of your specs belong to one **Project**, ask "list my Linear projects" and copy
that id into `linear.projectId` — it becomes the *default* the project picker
pre-selects, not a fixed destination.

## 4. Scaffold the config

`init` dropped a `specs/.core/linear.config.json.example`. Copy it and fill in the
ids from step 3 — the team id is the only required field:

```jsonc
// specs/.core/linear.config.json
{
  "linear": {
    "teamKey": "SKI",
    "teamId": "e07c2b54-dcf6-4b6e-81bd-175a9bc79868",
    "projectId": ""              // optional: the project picker's default
  },
  "intake": {                    // optional: starting a spec from an issue
    "label": "web-app",          // the inbox `/spec --from-issue` browses
    "bugLabels": ["bug"]         // issues with these route to /spec-bug
  }
}
```

Everything else (state names, field ownership) has sensible defaults — see
`linear.config.md` to customise. The moment this file exists, the Linear steps in
`/spec` and `/spec-go` and the three sync skills switch on.

## 5. Link a spec to a Linear issue

A spec syncs once its `00-overview.md` frontmatter carries a `linear_identifier`.
Two ways to get there:

- **New spec:** run `/spec` — with Linear configured it asks which Project the
  spec belongs to, creates a linked Linear **issue** (one sub-issue per phase) and
  stamps the id for you.
- **From an existing issue:** run `/spec SKI-123` to adopt that issue, or
  `/spec --from-issue` to browse the `intake.label` inbox and pick one. The issue
  becomes the spec's issue — nothing is duplicated. A bug-labelled issue routes to
  `/spec-bug` instead.
- **Existing spec / existing Linear issue:** add the id by hand. Ask Claude to
  "create a Linear issue for this spec" (or find an existing one's id), then set
  the frontmatter:

  ```yaml
  ---
  linear_identifier: "SKI-123"
  ---
  ```

## 6. Everyday sync

| Command | Direction | What it does |
|---------|-----------|--------------|
| `/spec-status` | — | Read-only drift report: what would push (create/update), and whether Linear's workflow-state drifted from the spec. Writes nothing. |
| `/spec-push`   | repo → Linear | Computes a create/update plan vs the last-pushed snapshot and applies it (issue description/state, phase sub-issues), stamping new ids back into the spec. |

Typical loop: edit the spec in-repo → `/spec-status` (what's pending) →
`/spec-push` (send it up). There is no pull — Linear is a generated mirror.

### What gets pushed

| Field | What |
|-------|------|
| `description` | the spec body (problem, solution) as the issue description |
| `subIssues` | one per phase — phase name as **title**, `**Goal:**` as the **description**, phase emoji → **state** |
| `workflowState` → issue state | the spec's lifecycle folder bucket, mapped via `states` |

Tasks, priority, labels, cycles and comments are **Linear-native triage** (or
repo-only) — never pushed, so they're never clobbered. A workflow-state a teammate
moves in Linear is surfaced by `/spec-status` as drift and overwritten on the next
push.

The spec is one issue and each phase a **sub-issue** (`parentId` = the spec
issue). The link ids live in frontmatter — `linear_identifier` on the overview,
`linear_issue_id` on each phase file; `/spec-push` stamps them the first time it
creates each object, so later pushes update instead of recreate. Set
`linear.projectId` to add every spec issue to a grouping Linear Project.

Sections listed in `sync.localOnlySections` (default: **State log**, **Changelog**,
**Open questions**) are stripped from the pushed description — they never leave
the repo.

## 7. What to commit

- **Commit** `specs/.core/linear-base/` — the last-pushed snapshots (content
  hashes per spec, so `/spec-push` knows what changed without reading Linear
  back). Each worktree carries its own, so it must travel with the branch.

## 8. Smoke test (verify your setup)

With a linked spec, confirm push end-to-end:

1. `/spec-status` → shows what would push (`pending — N to create, M to update`).
2. `/spec-push` → creates the spec issue and its phase sub-issues and sets the
   description/state; ids are stamped back into the spec.
3. `/spec-status` again → **up to date** (nothing changed since the last push).
4. Edit a phase goal locally, `/spec-push` → the matching sub-issue updates;
   `/spec-status` returns to **up to date**.

## Troubleshooting

- **"connect the `linear` MCP server"** — the server isn't connected/authed for
  this session. Re-run step 2; remember a fresh add needs a Claude Code restart.
- **"missing required tools: issueCreate"** — you're on the read-only endpoint
  (or a restricted API key). Use `https://mcp.linear.app/mcp` for push.
- **A configured state name silently does nothing** — Linear ignores an unknown
  issue state. Run `/spec-status` (it validates the `states` names against the
  workspace) and fix `linear.config.json` to the real issue-state names
  (`Backlog / Todo / In Progress / Done / Canceled`).
- **Reconnecting doesn't switch workspace** — Linear ties the OAuth session to one
  workspace. Remove and re-add the server to authenticate against another.
- **Bold around an inline code span renders oddly in Linear** — Linear moves the
  closing `**` before an inline code span on save (`**no unresolved `` `X` ``**`
  → `**no unresolved** `` `X` ``). This is a Linear rendering quirk in the mirror
  only; it never touches your repo (one-way sync never reads content back), so
  it's cosmetic. Avoid wrapping a whole phrase that ends in code in bold if the
  mirror's rendering matters to you.
