# Setting up Linear sync (one-way)

A start-to-finish guide to getting `/spec-status` and `/spec-push` working against
a real Linear workspace. Sync is **one-way**: the repo is the source of truth and
the linked Linear **issue** is a **generated mirror** — content is pushed up, never
read back or merged. A spec is a Linear issue and each phase a sub-issue, with the
phase's tasks mirrored into that sub-issue's description as a read-only
checklist. Covers the **Linear side** (connecting the MCP server, finding your
team) that the config reference (`linear.config.md`) assumes you already have.

> The whole feature is **opt-in**: until `specs/.core/linear.config.json` exists,
> everything below is inert and the package behaves exactly like the base
> `@skitterbyte/skitterspec`.

---

## Upgrading an existing install

Fresh installs can skip this section. **`MIGRATION.md` ships with the package** —
read the entry for the version you are coming from before upgrading a repo with a
live mirror.

**From 9.x — `push` now validates your issue states.** `spec-sync push` refuses
to run until the configured `states` names have been checked against the
workspace. `/spec-push` does that for you, so nothing changes if you drive sync
through the skill; a script calling the CLI directly must pass
`--workspace-states <file>` (or `--skip-state-check`). See `MIGRATION.md`
→ "v9 → v10".

**From 8.x — the mirror was remapped.** A spec is now an **issue** (was a
Project), a phase a **sub-issue** (was a Milestone), and tasks are no longer
objects. The frontmatter keys moved with it, so a spec linked under 8.x reads as
**unlinked** — the next `/spec-push` would mint a fresh mirror and abandon the old
one. `push` detects this and refuses to let the plan be applied blind, but read
`MIGRATION.md` → "v8 → v9" first.

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

## 3. Configure — run `/spec-linear-setup`

With the MCP server connected, let the skill do it:

```
/spec-linear-setup
```

It discovers your workspace (teams, projects, labels, issue workflow states),
asks how the work is **organised**, and writes `specs/.core/linear.config.json`
for you. You pick from real lists — no UUID is ever typed by hand.

The questions it asks, and why each one matters:

| It asks | Because |
|---------|---------|
| Which team does this repo file into? | The config pins **one team per repo**. With several teams the real question is which product's work this repo holds. |
| Are products split by team, or by project? | Team-per-product ⇒ `teamId` *is* the product and `projectId` stays empty. Project-per-product ⇒ one team, and `projectId` is the picker's default. |
| Which labels drive intake? | `intake.label` is the inbox `/spec --from-issue` browses; `bugLabels`/`hotfixLabels` route an issue to `/spec-bug` or `/spec-hotfix`. Optional — "none" leaves intake off. |

### What setup validates

The skill hands your answers to `skitterspec spec-sync init-config`, which
**checks them before writing** — the config is never composed by the model.

The check that earns its keep is on the **workflow-state names**.
`states` maps each lifecycle bucket to a Linear issue-state name, and
**Linear silently ignores an issue state it doesn't recognise**: no error, no
warning. So a workspace that renamed `Done` to `Shipped` would push perfectly
clean and produce a mirror that *never moves* — and you'd find out weeks later
wondering why nothing in Linear reflects your specs. Setup compares the
configured names against the workspace's real ones and refuses, naming the flag
that fixes each:

```
states.complete: "Done" is not an issue state in this workspace
  pass --state complete="Shipped"
```

It also writes **only the keys that differ from the defaults**, so the file shows
the handful of choices that are actually yours and keeps inheriting the rest as
they improve.

**Re-running is safe.** With a config already present the skill *reviews* it
against the live workspace rather than replacing it — the quickest way to find
out that a team was archived or a state renamed. It only rewrites if you ask.

## 4. Configure by hand (if you're not using Claude Code)

The skill is the recommended path, not the only one — the CLI works on its own.

**Find your team id.** Ask Claude ("List my Linear teams with their ids"), or
call Linear's `list_teams` yourself. You'll get rows like:

```
Skitterspec — e07c2b54-dcf6-4b6e-81bd-175a9bc79868  (key: SKI)
```

Copy the `id` (the UUID); the `key` (e.g. `SKI`) is the short human handle.

**Then either run the engine directly:**

```sh
skitterspec spec-sync init-config \
  --team-id e07c2b54-dcf6-4b6e-81bd-175a9bc79868 --team-key SKI \
  --intake-label web-app --bug-labels bug \
  --states states.json          # a JSON array of your issue-state names
```

`--states` is optional here (unlike `/spec-push`'s check, which is mandatory) —
without a config there is nothing to read a team from, so the names can't be
fetched first. Pass it if you have them; without it the command writes and tells
you the names are unverified.

**Or copy the example and edit it.** `init` dropped a
`specs/.core/linear.config.json.example`; the team id is the only required
field:

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

> Editing by hand skips the state-name check described above. If you go this
> route and your workspace renamed any state, `/spec-push` catches it at your
> first push instead.

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
- **"refusing — the configured issue states have not been validated"** — `push`
  requires the workspace's issue-state names (`--workspace-states <file>`), which
  `/spec-push` fetches for you. Run the skill rather than the CLI directly, or
  pass the file yourself.
- **"refusing — configured state name(s) not in the workspace"** — Linear ignores
  an unknown issue state, so this is caught before the push rather than after.
  The refusal names the replacement for each; re-run `/spec-linear-setup` to fix
  it, or edit `linear.config.json` → `states` to the real issue-state names
  (`Backlog / Todo / In Progress / Done / Canceled`). Upgrading from 8.x, the
  value inverts: project status `Completed` → issue state `Done`.
- **Reconnecting doesn't switch workspace** — Linear ties the OAuth session to one
  workspace. Remove and re-add the server to authenticate against another.
- **Bold around an inline code span renders oddly in Linear** — Linear moves the
  closing `**` before an inline code span on save (`**no unresolved `` `X` ``**`
  → `**no unresolved** `` `X` ``). This is a Linear rendering quirk in the mirror
  only; it never touches your repo (one-way sync never reads content back), so
  it's cosmetic. Avoid wrapping a whole phrase that ends in code in bold if the
  mirror's rendering matters to you.
