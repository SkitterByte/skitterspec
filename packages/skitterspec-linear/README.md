# @skitterbyte/skitterspec-linear

Spec-driven development for [Claude Code](https://claude.com/claude-code), **with
Linear hybrid-sync**. A strict **superset** of
[`@skitterbyte/skitterspec`](https://www.npmjs.com/package/@skitterbyte/skitterspec):
everything in the base filesystem workflow, plus git-like sync between a spec and
its linked Linear project.

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

4. **Link and sync** — `/spec` now creates a linked Linear Project (a Milestone
   per phase) and stamps the id; then `/spec-status`, `/spec-pull`, `/spec-push`
   keep the spec and its project in step. Optionally turn on the per-Milestone /
   per-Issue **body round-trip** (see below).

## What the superset adds

On top of the base skills (`/spec`, `/spec-go`, isolation, …):

- **`/spec-status`** — read-only, per-field divergence (local-only / remote-only /
  conflict / in-sync). Changes nothing.
- **`/spec-pull [--force]`** — Linear → repo. Applies remote-only fields; refuses
  to clobber a conflicting local edit unless `--force`.
- **`/spec-push [--force]`** — repo → Linear. Ownership-respecting,
  concurrency-checked; refuses if Linear moved since base unless `--force`.
- **`spec-sync` CLI** (`skitterspec-linear spec-sync …`) — the deterministic
  engine behind the skills, for CI / local runs.

The shared `/spec` and `/spec-go` skills come composed with the Linear steps
filled in: `/spec` links a new spec to a Linear Project (a Milestone per phase),
and `/spec-go` pulls first so you build against the current shared state.

## Opt-in

Linear sync is inert until `specs/.core/linear.config.json` exists — copy the
scaffolded `linear.config.json.example` and fill in your team id. Without it, this
behaves exactly like the base.

**Start here:** `specs/.core/SETUP.md` (scaffolded by `init`) is the full
setup guide — connecting the `linear` MCP server, finding your team id, linking a
spec, and a smoke test. Per-field docs live in `specs/.core/linear.config.md`.

**What syncs:** by default the whole spec body travels as the Linear Project
**`description`** (co-authored, push + pull); **status / priority / labels** are
Linear-owned (pull only). **Field ownership** (`both` / `pull` / `push`) collapses
conflicts — only a `both` field that moved on both sides is a real conflict, and
`--force` backs up the losing side before winning. **Opt into a per-Milestone /
per-Issue body round-trip** — phases ↔ Linear Milestones and tasks ↔ Issues,
compared per item — by adding `milestones`/`tasks` to `sync.keyedFields` (see the
"Body round-trip" section of `linear.config.md`); deletions there are report-only.
**Base sidecars** (`specs/.core/linear-base/`) are committed; **backups**
(`specs/.core/linear-backups/`) are gitignored.

Branch naming that embeds the Linear id lives in the isolation config
(`env.config.json` → `branch.pattern` with `{identifier}`, `branch.identifierField:
"linear_identifier"`), not in `linear.config.json`.

## Migrating from `@skitterbyte/skitterspec` v1

If you used Linear sync on the old base, switch here and re-run `init` — see
[MIGRATION.md](../../MIGRATION.md). Your `specs/.core/linear.config.json` path is
unchanged.

MIT © Reuben Greaves
