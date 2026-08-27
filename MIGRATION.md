# Migration guide

## `@skitterbyte/skitterspec-linear` v9 → v10 (`push` validates your issue states)

**`spec-sync push` now refuses to run until the configured `states` names have
been checked against your Linear workspace.** The check itself is not new — it
already existed on `spec-sync status --workspace-states` — but it was advisory,
and skipping it sent a state name Linear **silently ignores**: the description
lands, the issue never moves, and nothing errors. The base
`@skitterbyte/skitterspec` is unaffected.

### Breaking change

| | v9 | v10 |
|---|-----|-----|
| `spec-sync push <spec>` | runs | **exits 1** unless `--workspace-states <file>` or `--skip-state-check` is passed |
| A configured state absent from the workspace | pushed, silently no-op | **exits 1**, naming the workspace's real states |

`/spec-push` handles this for you — it fetches the workspace's issue
workflow-state names over MCP and passes them on. **Nothing changes if you drive
sync through the skill.** Only a direct CLI caller needs updating.

### What to do

1. **Using `/spec-push`?** Nothing. Run `update` and carry on.
2. **Calling `spec-sync push` from CI or a script?** Supply the workspace's issue
   workflow-state names as a JSON array and pass the file:

   ```sh
   # names come from your Linear workspace, e.g. via the MCP server or the API
   echo '["Backlog","Todo","In Progress","Done","Canceled"]' > states.json
   skitterspec spec-sync push my-spec --workspace-states states.json --json
   ```

   Or opt out deliberately with `--skip-state-check`. Don't reach for it to get
   past a *failing* check — that check is the only thing standing between you and
   a push that moves nothing.
3. **If the check refuses,** it tells you what your workspace actually has and,
   where the lifecycle bucket makes it unambiguous, which name to use:

   ```
   spec-sync push: refusing — configured state name(s) not in the workspace

     states.complete: "Done" is not an issue state in this workspace
       use "Completed" instead

     available: Backlog, Todo, In Progress, Completed, Canceled
   ```

   Fix `specs/.core/linear.config.json` → `states`. `/spec-push` will offer to
   apply the fix for you.

### Also in v10 (not breaking)

- **A pre-9.0 mirror is detected before it can be orphaned.** A spec still
  carrying `linear_project_id` / `linear_milestone_id` reads as unlinked to v9+,
  so `push` would emit an all-creates plan and abandon the live mirror. The plan
  now carries a `legacy` field naming how many objects that would strand, and
  `/spec-push` stops. **If you skipped the v8 → v9 migration below, read it now** —
  this is the guard that catches you, not a substitute for it.
- **`update` says what it skipped** — each `customized (kept)` file now reports
  `+added −removed`, with `--diff` to see the upstream changes you declined.
- **This guide now ships inside the package** (it wasn't in the published tarball
  before v10 — `files` listed only `bin`/`src`/`assets`).

## `@skitterbyte/skitterspec-linear` v8 → v9 (a spec is an Issue, phases are sub-issues)

**v9 remaps the Linear mirror.** A spec is now a Linear **issue** (not a Project),
each phase a **sub-issue** (not a Milestone), and **tasks are no longer synced**
(they stay in the repo phase files). This collapses a large spec from ~1 project +
N milestones + dozens of task-issues down to **one issue + one sub-issue per
phase**. The base `@skitterbyte/skitterspec` is unaffected (still v15).

### Breaking changes

| Area | v8 | v9 |
|------|-----|-----|
| `linear.config.json` → `mapping` | `{specFolder:"project", phases:"milestone", tasks:"issue"}` | `{specFolder:"issue", phases:"subissue", tasks:"none"}` |
| `linear.config.json` → `linear` | `initiativeId` | `projectId` (the project picker's default) |
| `linear.config.json` → `states` | Linear **Project** statuses (e.g. `Completed`) | Linear **issue** workflow states (e.g. `Done`) |
| `linear.config.json` → `sync.fieldOwnership` | `{description, milestones, tasks, workflowState}` | `{description, subIssues, workflowState}` |
| Phase frontmatter | `linear_milestone_id` | `linear_issue_id` (the sub-issue id) |
| Overview frontmatter | `linear_project_id` + `linear_identifier` | `linear_identifier` (the spec issue) |
| Last-pushed snapshot | `{project, milestones, issues}` | `{issue, subIssues}` |

### What to do

1. **Upgrade and re-run `update`:** `npx @skitterbyte/skitterspec-linear update`.
   It refreshes the skills, the `linear.config.md` / `SETUP.md` docs, and the
   config example.
2. **Edit `specs/.core/linear.config.json`** to the new keys above (or delete it
   and re-copy `linear.config.json.example`). Point `states` at your workspace's
   **issue** states; set `linear.projectId` if most specs belong to one Project —
   it pre-selects the picker's default rather than fixing every spec there.
3. **Optionally add `intake`** to start specs from issues someone else filed:

   ```jsonc
   "intake": {
     "label": "web-app",      // the inbox `/spec --from-issue` browses
     "bugLabels": ["bug"]     // issues with these route to /spec-bug
   }
   ```

   Without it, `/spec SKI-123` still adopts an issue by id; only the browsable
   inbox and the bug routing need the labels.
4. **Existing pushed specs:** the snapshot format changed, so the first
   `/spec-push` after upgrading **re-creates** the mirror (a fresh issue +
   sub-issues). Delete any stale `specs/.core/linear-base/*.base.json` and the old
   `linear_project_id` / `linear_milestone_id` frontmatter first. If you were
   pre-first-push, there's nothing to reconcile.
5. **Task-level issues** created under v8 are no longer managed by the sync —
   close or repurpose them in Linear by hand.

## `@skitterbyte/skitterspec-linear` v7 → v8 (sync goes one-way; `/spec-pull` removed)

**v8 made sync one-way.** The repo became the sole source of truth and Linear a
**generated mirror**: content is pushed up, never read back or merged. The
three-way merge engine and everything that fed it were retired.

### Breaking changes

| Area | v7 | v8 |
|------|-----|-----|
| Skills | `/spec-status`, `/spec-push`, **`/spec-pull`** | `/spec-status`, `/spec-push` |
| `spec-sync` subcommands | `normalize`, `push`, `status`, **`pull`** | `normalize`, `push`, `status`, **`record`** |
| Sidecar | a three-way merge base | the **last-pushed snapshot** (`record` writes it) |
| `sync.fieldOwnership` | `pull` / `both` values were load-bearing | still parsed; nothing is pulled |

### What to do

1. **Drop `/spec-pull` from any workflow that calls it.** There is no
   replacement: editing the mirror in Linear is no longer an input. A person
   editing the issue will see it overwritten by the next push.
2. **Replace `spec-sync pull` in scripts with `spec-sync record`** — it writes the
   snapshot from the current repo files after a push is applied.
3. **Delete stale merge-base sidecars** under `sync.baseDir`; the first push after
   upgrading writes the new snapshot format.

## `@skitterbyte/skitterspec-linear` v1 → v7 (no breaking changes)

Every major in this range was a **routine version bump**, not a breaking
contract. The skills (`/spec-status`, `/spec-push`, `/spec-pull`) and the
`spec-sync` subcommands (`normalize`, `push`, `pull`, `status`) were identical at
v1 and at v7. Upgrading anywhere inside this range needs **no action** beyond
re-running `update`.

One thing did change quietly, at **v4**: `sync.fieldOwnership` lost its
`milestones`, `phaseBodies`, `acceptanceCriteria` and `taskBreakdown` entries when
that detail moved inside `description`. A config still listing them does not
error — unknown keys merge in and *join the compared set* — so remove them if
you have them, or they will be compared against fields that no longer exist.

## `@skitterbyte/skitterspec` v3 → v16 (no breaking changes)

**Nothing in this range requires action.** Thirteen majors sounds like thirteen
migrations; it was one habit. Every release in this period was cut as a major
bump regardless of size (see `RELEASING.md`), and the base package's contract
never broke: **no skill was ever removed and no CLI flag was ever removed** — the
surface only grew. The spec folder layout
(`.core`/`backlog`/`in-progress`/`complete`/`cancelled`) is unchanged throughout.

The `feat(sync)!` commits that appear in this window changed
`@skitterbyte/skitterspec-linear`, which ships separately; the base was bumped
alongside it in lockstep. If you are on the **superset**, read the provider
entries above — those are the ones with work in them.

What each major actually added, so you can see what you gain by upgrading:

| Major | What landed |
|-------|-------------|
| v4 | `setup` commands bootstrap a fresh worktree's dependencies |
| v5, v6 | version bumps only |
| v7 | release docs refreshed; stale scripts dropped |
| v8 | version bump only |
| v9 | released alongside the provider's Linear body round-trip |
| v10, v11 | version bumps only |
| v12 | install manifest + `update --resync` / `--reset`; **`/spec-live`** overlay |
| v13 | **`/spec-hotfix`**, **`/spec-to-main`**, `spec-env prune` for orphaned test DBs |
| v14 | **Impact map** in the spec templates; live-aware `/spec-go`; the docs site |
| v15 | released alongside the provider's one-way sync switch |
| v16 | spec `Name:` handle; `/spec-complete` · `/spec-cancel` commit their own edits |

**Spec files written under an older version still read.** The template grew
(the Impact map at v14, the `Name:` header at v16) but the lifecycle skills treat
both as optional — `/spec-review` adds them if you want them.

## `@skitterbyte/skitterspec` v2 → v3 (slimmer surface + local traffic diversion)

**v3 shrinks the everyday command surface to five verbs — `spec → go → connect →
commit → complete` — by folding provisioning, teardown, and grooming into the
lifecycle skills, and adds `/spec-connect` for testing a worktree at your normal
`localhost` URL.** (`@skitterbyte/skitterspec-linear` moves to v2.0.0 in lockstep.)

### Removed skills (breaking) → where they went

| Removed skill | Replaced by |
|---------------|-------------|
| `/spec-env` | **Automatic in `/spec-go`** — it provisions the worktree and (with your OK) starts the spec's dev servers. Escalate Docker later with the CLI: `skitterspec spec-env up <name>`. |
| `/spec-env-down` | **Folded into `/spec-complete` and `/spec-cancel`** — they tear the environment down (dev servers, worktree, stack, slot) as part of finishing/abandoning a spec. |
| `/spec-ready` | **Folded into `/spec`** — grilling now writes a `Ready` spec directly (or `Draft` if you deliberately leave open questions). Go straight to `/spec-go`. |

The **`skitterspec spec-env` CLI engine stays** (`up`, `down`, `dev`, `connect`,
`integrate`, `status`, `resolve`) — only the three *skills* were removed. Anything
that scripted those CLI verbs keeps working.

### New — `/spec-connect` and two config blocks

- **`/spec-connect <name>`** points your canonical `localhost` ports at a spec's
  running dev servers (so you can test a worktree's UI/API at the normal URL);
  `/spec-connect main` hands the ports back. It's a small bundled Node reverse
  proxy — no external install. Exclusive: one spec exposed at a time.
- **`env.config.json` gains `dev` and `proxy` blocks.** `dev` lists the host dev
  servers `/spec-go` starts (`{ name, command, portVar, health?, frontPort? }`);
  `proxy` configures the front-door proxy (`{ enabled, host }`). Both default to
  off/empty, so existing projects are unaffected until you fill `dev` in.

### What to do

1. **Upgrade and re-run `init`** (or `update`): `npx @skitterbyte/skitterspec
   update`. It stops installing the three removed skills, installs `/spec-connect`,
   and refreshes the CLAUDE.md section + `spec-planning` rule. Your specs and
   `env.config.json` are untouched.
2. **Remove muscle memory for the old commands** — use `/spec-go` to bring a spec
   up, `/spec-complete`/`/spec-cancel` to tear it down, and `/spec` (no separate
   `/spec-ready`) to reach a Ready spec.
3. **To test UI/API worktrees:** add a `dev` block to `env.config.json` (see
   `specs/.core/env.config.md`), then `/spec-go` → `/spec-connect <name>`.

## `@skitterbyte/skitterspec` v1 → v2 (tracker-free base)

**v2 of the base package is tracker-free.** The Linear sync feature — the
`/spec-status`, `/spec-push` skills, the `spec-sync` CLI, the
Linear-aware steps of `/spec` and `/spec-go`, and the `linear.config.*`
templates — moved out of `@skitterbyte/skitterspec` into a separate **superset**
distribution, `@skitterbyte/skitterspec-linear`. You now install exactly one:

| If you… | Install |
|---------|---------|
| don't sync specs to a tracker | `@skitterbyte/skitterspec` (v2) |
| use (or want) Linear sync | `@skitterbyte/skitterspec-linear` |

Everything else — the spec lifecycle and per-spec isolation — is unchanged and
present in **both**.

### If you did NOT use Linear sync

Nothing to do. Upgrade to v2 and re-run `init` (or `update`) as usual. The base
never installed the Linear skills for you, so there's nothing to remove.

### If you DID use Linear sync

Switching is one install plus a re-`init`:

1. **Install the superset** (in place of the base):

   ```sh
   npm rm @skitterbyte/skitterspec        # if it was a dependency
   npx @skitterbyte/skitterspec-linear init
   ```

2. **Re-run `init`.** It re-installs the shared skills (now composed with the
   Linear steps) and the three sync skills, and re-scaffolds the config
   templates. Your existing files are preserved — `init` never overwrites without
   `--force`.

3. **Your config is unchanged.** The live config path is still
   `specs/.core/linear.config.json`, and the committed base sidecars under
   `specs/.core/linear-base/` are read as-is. No re-linking, no re-sync.

That's it — `/spec-status`, `/spec-push`, and `skitterspec-linear
spec-sync …` work exactly as before.

### One config note — branch naming

Embedding the Linear identifier in a worktree branch name is now configured in the
**isolation** config, not the Linear config. In `specs/.core/env.config.json` set:

```jsonc
"branch": { "pattern": "{identifier}-{slug}", "identifierField": "linear_identifier" }
```

If you don't need the id in branch names, leave the default `{type}/{slug}` — the
old implicit Linear-branch behaviour is off unless you opt in this way. (This is
the only behavioural change beyond the package split.)

## Why the split

The base couldn't ship without a specific tracker's fingerprints baked into shared
skills and a `src/sync/` engine. Extracting the provider makes the base a clean,
tracker-free workflow and lets a new provider (e.g. Jira) ship as another superset
over the same base — without re-patching the base. See
`specs/complete/feat-extract-ticketing-provider/` for the full rationale.
