# Setting up Linear hybrid-sync

A start-to-finish guide to getting `/spec-status`, `/spec-pull`, and `/spec-push`
working against a real Linear workspace. Covers the **Linear side** (connecting
the MCP server, finding your team) that the config reference
(`linear.config.md`) assumes you already have.

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
> `/spec-status` and `/spec-pull` without granting write access. `/spec-push`
> needs the full (writable) endpoint.

## 3. Find your team id

`linear.config.json` needs your Linear **team UUID**. The easiest way is to just
ask Claude once the MCP server is connected:

> "List my Linear teams with their ids."

It calls the Linear `list_teams` tool and returns rows like:

```
Skitterspec — e07c2b54-dcf6-4b6e-81bd-175a9bc79868  (key: SKI)
```

Copy the `id` (the UUID). The `key` (e.g. `SKI`) is the short human handle. If you
want an **Initiative** to group your specs, ask "list my Linear initiatives" and
copy that id too (optional).

## 4. Scaffold the config

`init` dropped a `specs/.core/linear.config.json.example`. Copy it and fill in the
ids from step 3 — the team id is the only required field:

```jsonc
// specs/.core/linear.config.json
{
  "linear": {
    "teamKey": "SKI",
    "teamId": "e07c2b54-dcf6-4b6e-81bd-175a9bc79868",
    "initiativeId": ""            // optional
  }
}
```

Everything else (state names, field ownership) has sensible defaults — see
`linear.config.md` to customise. The moment this file exists, the Linear steps in
`/spec` and `/spec-go` and the three sync skills switch on.

## 5. Link a spec to a Linear project

A spec syncs once its `00-overview.md` frontmatter carries a `linear_project_id`.
Two ways to get there:

- **New spec:** run `/spec` — with Linear configured it offers to create a linked
  Linear **Project** (one Milestone per phase) and stamps the id for you.
- **Existing spec / existing Linear project:** add the id by hand. Ask Claude to
  "create a Linear project for this spec" (or find an existing one's id via
  `list_projects`), then set the frontmatter:

  ```yaml
  ---
  linear_project_id: "640bcb1a-28cd-46b5-b2f8-ff47ce494ed1"
  ---
  ```

## 6. Everyday sync

| Command | Direction | What it does |
|---------|-----------|--------------|
| `/spec-status` | — | Read-only. Per-field divergence: `local-only` / `remote-only` / `conflict` / `in sync`. |
| `/spec-pull`   | Linear → repo | Applies remote-owned fields (status/priority/labels). Refuses a real conflict unless `--force`. |
| `/spec-push`   | repo → Linear | Sends the co-authored `description` up. Refuses if a co-authored field moved on Linear since your last sync (pull first) unless `--force`. |

Typical loop: `/spec-status` → `/spec-pull` (take Linear's status) → edit the spec
in-repo → `/spec-push` (send content up).

### What actually syncs

| Field | Owner | Direction |
|-------|-------|-----------|
| `description` (the whole spec body: problem, solution, **phases**, acceptance criteria) | co-authored | push **and** pull |
| `workflowState` → `spec_status` | Linear | pull only |
| `priority` | Linear | pull only |
| `labels` | Linear | pull only |

By default the **entire spec body travels as the project `description`** — phases
and acceptance criteria included.

**Optional: body round-trip.** Opt in — add `milestones`/`tasks` to
`sync.keyedFields` (and `sync.fieldOwnership`) — and phases sync as **Milestones**
and tasks as **Issues**, compared per item: edit an individual phase or task in
Linear and pull just that back into the right phase file / task line, or push
local changes up. The link ids live in the phase file frontmatter
(`linear_milestone_id`) and inline on task lines (`- [ ] do it (SKI-123)`).
Deletions are report-only (surfaced by `/spec-status`, never auto-applied). Full
details in the "Body round-trip" section of `linear.config.md`.

Sections listed in `sync.localOnlySections` (default: **State log**, **Changelog**,
**Open questions**) are stripped from the pushed description — they never leave
the repo.

## 7. What to commit

- **Commit** `specs/.core/linear-base/` — the three-way merge's base sidecars
  (last-synced snapshot per spec). Each worktree carries its own, so it must
  travel with the branch.
- **Gitignore** `specs/.core/linear-backups/` — `--force` recovery copies, local
  and per-machine. Add `specs/.core/linear-backups/` to `.gitignore`.

## 8. Smoke test (verify your setup)

With a linked spec, confirm the round-trip end-to-end:

1. `/spec-status` → note the current divergence.
2. `/spec-pull` → Linear's status/priority/labels land in the spec's frontmatter
   (`spec_status`, `priority`, `labels`).
3. `/spec-status` again → **in sync**. (This also proves description idempotency:
   Linear rewrites markdown bullets on save, and the sync canonicalizes both
   sides so that never shows as a spurious change.)
4. Edit the spec body locally, `/spec-push` → the change lands on the Linear
   project's description; `/spec-status` returns to **in sync**.

## Troubleshooting

- **"connect the `linear` MCP server"** — the server isn't connected/authed for
  this session. Re-run step 2; remember a fresh add needs a Claude Code restart.
- **"missing required tools: projectUpdate"** — you're on the read-only endpoint
  (or a restricted API key). Use `https://mcp.linear.app/mcp` for push.
- **A field won't stop showing as diverged** — that field genuinely differs on
  the two sides. `pull`-owned fields (status/priority/labels) resolve to Linear;
  `/spec-pull` reconciles them. For a co-authored `conflict`, resolve locally or
  `--force` (which backs up the losing side under `sync.backupDir` first).
- **Reconnecting doesn't switch workspace** — Linear ties the OAuth session to one
  workspace. Remove and re-add the server to authenticate against another.
