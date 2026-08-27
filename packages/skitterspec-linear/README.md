# @skitterbyte/skitterspec-linear

Spec-driven development for [Claude Code](https://claude.com/claude-code), **with
one-way Linear sync**. A strict **superset** of
[`@skitterbyte/skitterspec`](https://www.npmjs.com/package/@skitterbyte/skitterspec):
everything in the base filesystem workflow, plus one-way sync from a spec up to
its linked Linear issue — the repo is canonical, Linear is a generated mirror.

```sh
npx @skitterbyte/skitterspec-linear init
```

Install **this OR the base**, never both — this package contains the entire base.

## Quick start

Get sync working in four steps (the scaffolded `specs/.core/SETUP.md` is the
fuller guide):

1. **Install** into your repo:

   ```sh
   npx @skitterbyte/skitterspec-linear init
   ```

2. **Connect the Linear MCP server** (once per machine) — the skills talk to
   Linear over MCP, so this is the prerequisite people miss:

   ```sh
   claude mcp add --transport http linear https://mcp.linear.app/mcp
   ```

   Then, in Claude Code, run `/mcp` → select **linear** → **Authenticate** (a
   browser opens; pick your workspace). A freshly added server only shows up after
   Claude Code restarts — relaunch with `claude --continue` if you don't see it.
   Verify with `claude mcp list` (want `linear … ✓`).

3. **Configure** — copy the scaffolded example and fill in your team id (ask
   Claude "list my Linear teams" once connected to get it):

   ```jsonc
   // specs/.core/linear.config.json
   { "linear": { "teamId": "<your-team-uuid>" } }
   ```

   That file is the opt-in gate — until it exists, everything below is inert and
   the package behaves exactly like the base.

4. **Link and push** — `/spec` creates a linked Linear issue (a sub-issue per
   phase) and stamps the id; then `/spec-push` publishes the spec up and
   `/spec-status` reports what would push. Sync is **one-way**: the repo is the
   source of truth and Linear is a generated mirror.

## What the superset adds

On top of the base skills (`/spec`, `/spec-go`, isolation, …):

- **`/spec-status`** — read-only drift report: what the next push would create /
  update, plus any workflow-state drift. Changes nothing.
- **`/spec-push`** — repo → Linear, one-way. Diffs the spec against a committed
  last-pushed snapshot and applies only what changed (issue description + state,
  phase sub-issues), stamping the returned ids back into the spec.
- **`spec-sync` CLI** (`skitterspec-linear spec-sync …`) — the deterministic
  engine behind the skills, for CI / local runs.

The shared `/spec` and `/spec-go` skills come composed with the Linear steps
filled in: `/spec` links a new spec to a Linear issue (a sub-issue per phase).
There is no pull — the repo is already canonical, so `/spec-go` just builds.

## Opt-in

Linear sync is inert until `specs/.core/linear.config.json` exists — copy the
scaffolded `linear.config.json.example` and fill in your team id. Without it, this
behaves exactly like the base.

**Start here:** `specs/.core/SETUP.md` (scaffolded by `init`) is the full
setup guide — connecting the `linear` MCP server, finding your team id, linking a
spec, and a smoke test. Per-field docs live in `specs/.core/linear.config.md`.

**What pushes:** the spec is one Linear **issue** — the spec body travels as its
**`description`**, each phase as a **sub-issue** (phase name → title, `**Goal:**`
→ description, phase emoji → state), and the spec's lifecycle folder sets the
issue's **workflow state**. Tasks are **not** synced — they stay in the repo phase
files. Priority, labels, cycles and comments are **Linear-native triage** — the
PM's to set in Linear; one-way sync neither pushes nor reads them, so they're
never clobbered. A workflow-state a teammate moves in Linear is surfaced by
`/spec-status` as drift and overwritten on the next push. Set `linear.projectId`
to group every spec issue under one Linear **Project**. **Last-pushed snapshots**
(`specs/.core/linear-base/`, content hashes) are committed so push sends only what
changed.

Branch naming that embeds the Linear id lives in the isolation config
(`env.config.json` → `branch.pattern` with `{identifier}`, `branch.identifierField:
"linear_identifier"`), not in `linear.config.json`.

## Migrating from `@skitterbyte/skitterspec` v1

If you used Linear sync on the old base, switch here and re-run `init` — see
[MIGRATION.md](../../MIGRATION.md). Your `specs/.core/linear.config.json` path is
unchanged.

MIT © Reuben Greaves
