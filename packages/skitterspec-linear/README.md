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

## Upgrading

```sh
npx @skitterbyte/skitterspec-linear update
```

`update` refreshes the files it manages (skills, rules, `specs/.core` docs) and
**keeps anything you edited**. A file it kept is listed under
`customized (kept)` with the change it declined summarised as `+added −removed`:

```
customized (kept):
  .claude/rules/spec-planning.md  +34 −13
```

Add `--diff` to see those changes as a unified diff before deciding whether to
re-apply your edits on top, or `--force` to take the package version and lose
them. Your `specs/` content and live `.core` config are never touched.

## What the superset adds

On top of the base skills (`/spec`, `/spec-go`, isolation, …):

- **`/spec-status`** — read-only drift report: what the next push would create /
  update, any workflow-state drift, and any phase whose status signals disagree
  (see **Phase status** below). Changes nothing.
- **`/spec-push`** — repo → Linear, one-way. Diffs the spec against a committed
  last-pushed snapshot and applies only what changed (issue description + state,
  phase sub-issues), stamping the returned ids back into the spec.
- **`spec-sync` CLI** (`skitterspec-linear spec-sync …`) — the deterministic
  engine behind the skills, for CI / local runs:
  `normalize` · `push` · `apply` · `states` · `stamp` · `record` · `verify` ·
  `status` · `linked`.
- **A direct-API push path.** Set a Linear personal API key and `/spec-push`
  applies its plan through the engine instead of one assistant call per issue —
  descriptions never pass through the model, in either direction:

  ```bash
  export LINEAR_API_KEY=lin_api_…    # Linear → Settings → Security & access
  ```

  `auth.keyEnv` names the variable (never the key itself); `apply.transport`
  pins `api`/`mcp`, or leave it empty to use the API whenever a key is present.
  `--via mcp` forces the original path for one run.
  **With no key nothing changes** — the MCP path is fully supported and stays
  the default for anyone who never sets one.
- **One-command adoption on an existing repo.**
  `skitterspec-linear spec-sync apply --all complete` pushes every spec in a
  lifecycle bucket, reporting what it created, updated, skipped and failed. A
  spec that fails doesn't stop the rest, and re-running retries only those —
  every id is written into the spec as soon as its object exists, so nothing is
  ever duplicated. Needs an API key. See `specs/.core/linear.config.md`.

**Every skill that moves a spec through its lifecycle** comes composed with the
Linear steps filled in, so the mirror keeps up without anyone remembering to
push: `/spec`, `/spec-bug` and `/spec-hotfix` link the spec they create (asking
which **Project** it belongs to, and minting a sub-issue per phase);
`/spec-go` refreshes it as work starts; `/spec-complete`, `/spec-cancel` and
`/spec-review` refresh it after they change it. All three creating skills can
also start **from** an existing issue — `/spec SKI-123`,
`/spec-hotfix v33.16.4 SKI-123`, or `--from-issue` to browse the ones your web
app filed. There is no pull — the repo is already canonical.

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
issue's **workflow state**. A phase's **tasks are mirrored** into its sub-issue's
description as a read-only checklist (`mapping.tasks: "checklist"`, the default;
`"none"` keeps the Goal line alone) — no issue is created per task, and a box
ticked in Linear is overwritten by the next push. Priority, labels, cycles and comments are **Linear-native triage** — the
PM's to set in Linear; one-way sync neither pushes nor reads them, so they're
never clobbered. A workflow-state a teammate moves in Linear is surfaced by
`/spec-status` as drift and overwritten on the next push. **Last-pushed snapshots**
(`specs/.core/linear-base/`, content hashes) are committed so push sends only what
changed.

**Fidelity safeguards.** Linear's markdown parser silently drops characters from
tables nested inside list items, so a nested table is reshaped before sending —
2-column tables become a bullet list, others a code block — and column-0 tables
are left alone. Your spec files are never modified. After a push, each stored
description is read back and compared against what was sent, ignoring Linear's
own reformatting and reporting anything genuinely lost. Both are automatic.

**How phases are mirrored** is `mapping.phases`, and it takes one mode for the
whole repo *or* one per lifecycle bucket:

```json
"mapping": { "phases": { "backlog": "deferred", "complete": "inline" } }
```

- `"subissue"` (default) — every phase is a sub-issue from the spec's first push,
  so agents can be assigned one each.
- `"deferred"` — unlinked phases wait until the work starts. A spec sitting in
  `specs/backlog/` mirrors as **the issue alone**, keeping its phase list in the
  description; the sub-issues arrive with the push that follows `/spec-go`. Worth
  it when adopting sync on a backlog of dozens of specs, where the default
  front-loads hundreds of calls for work nobody has started.
- `"inline"` — phases become **sections of the spec issue's own description**,
  full task lists included, and no sub-issues are minted. For work nobody will
  pick up phase by phase: 250 completed specs are 250 readable issues instead of
  250 issues plus 669 sub-issues.

The per-bucket form exists because those answers differ by *when*, not by repo —
finished work wants one issue, work in flight wants the assignable sub-issues.
A bucket the map omits defaults to `"subissue"`; a bad key or mode fails loudly at
load. Phases already carrying an id keep their sub-issue in every mode and are
never also inlined, so switching an existing project over never strands a live
sub-issue. `/spec-push` and `/spec-status` print the mode that resolved. See
`linear.config.md` for the details and the adoption path.

**Which Project a spec lands in** is asked once, when the issue is first created
— a filterable list of your team's projects, defaulting to `linear.projectId` and
always offering *None*. It's passed on the create call only and never stored, so
re-homing a spec issue in Linear sticks: it won't read as drift and won't be moved
back on the next push.

**Starting from an issue** (the `intake` block in the config): `/spec SKI-123`
adopts that issue, `--from-issue [query]` browses the inbox, and `/spec-bug` and
`/spec-hotfix` adopt the same way — `/spec-hotfix v33.16.4 SKI-123` starts a
patch to a released version from the issue that reported it. The issue *becomes*
the spec's issue — the reporter's thread, comments and links stay put, their
words are carried into the spec's **Problem** (or **Symptom**), and the linking
push replaces the description with the spec as it is created. Labels route an
issue onward: `intake.hotfixLabels` to `/spec-hotfix`, `intake.bugLabels` to
`/spec-bug`, with hotfix winning when an issue carries both.
`skitterspec-linear spec-sync linked` lists what's already adopted, so an issue
never becomes two specs.

**Phase status.** A phase's state in Linear comes from the `⬜`/`🔄`/`✅` on its
phase-file **heading** — not from its `> **Status:**` line and not from the
overview's phase-index row, which are the human mirrors of it. A heading carrying
no emoji reads as *not started*, so `spec-sync normalize|push|status` warn when
the emoji is missing or when the three disagree, rather than quietly mirroring a
finished phase as backlog. The warnings never block a push.

Branch naming that embeds the Linear id lives in the isolation config
(`env.config.json` → `branch.pattern` with `{identifier}`, `branch.identifierField:
"linear_identifier"`), not in `linear.config.json`.

## Migrating from `@skitterbyte/skitterspec` v1

If you used Linear sync on the old base, switch here and re-run `init` — see
[MIGRATION.md](../../MIGRATION.md). Your `specs/.core/linear.config.json` path is
unchanged.

MIT © Reuben Greaves
