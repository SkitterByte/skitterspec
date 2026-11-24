---
paths:
  - "specs/**"
---

# Spec Format

How a spec is laid out on disk. The lifecycle is in
`.claude/rules/spec-planning.md`.

## Lifecycle folders

```
specs/backlog/       Ready (or Draft) specs (/spec)
specs/in-progress/   under active implementation (/spec-start, /spec-bug, /spec-incident)
specs/complete/      finished (/spec-complete)
specs/cancelled/     abandoned, with a reason on the header (/spec-cancel)
specs/.core/         project rules — ALWAYS APPLY, never moved
```

Every spec is a **folder**, `specs/<bucket>/<name>/`, even a one-line change.
Inside it:

- `00-overview.md` is the dashboard. It holds the header, Summary, Problem,
  Acceptance criteria, Decisions, Solution overview, the **Impact map** (a
  `Surface | Change | Detail` table naming the endpoints, schemas, tables,
  routes and rules touched), the **phase index** (a table linking each phase
  file with `⬜`/`🔄`/`✅`), Open questions, State log and Changelog.
  **No per-phase task lists.**
- **One file per phase**: `01-<slug>.md`, `02-<slug>.md`, and so on, in
  execution order. Each holds its goal, its task checkboxes (tests included) and
  its notes. A single-phase spec still gets `01-….md`.

Keep the index and the phase files in sync. Legacy specs (a bare `<name>.md`,
or inline phases) are still read, but new specs always use folders.

## Kinds

Each spec has one of seven kinds, recorded twice: in the header
(`> **Type:** Feature`, `> **Type:** Chore`, …) and in the folder name
(`feat-<name>`, `chore-<name>`, `issue-<name>`, `bug-<name>`, `hotfix-<name>`,
`incident-<name>`, `epic-<name>`). Never use brackets.

- **Feature**: user-facing work that changes code. `feat` commits.
- **Chore**: code work no end user sees (tooling, CI, dependencies, internal
  refactors). `Gating:` defaults to `none: not user-facing`.
  `chore`/`refactor`/`ci` commits with no `Release-Note:`.
- **Issue**: no code change at all (configuration, a data fix, a support task),
  written as manual steps. `Gating:` defaults to `none: no code`. `docs`
  commits, no `Release-Note:`. It closes when the spec completes.
- **Bug**: a defect, test-first. `fix` commits.
- **Hotfix**: a bug fixed against a **released tag**. It carries
  `> **Base version:** <tag>`, forks from that tag, and lands by tagging a patch
  and cherry-picking onto `main`. `/spec-live` refuses it.
- **Incident**: a live outage, recorded while it happens. It carries
  `> **Severity:**` and a `## Timeline`. Its fixes are separate specs carrying
  `> **Incident:** incident-<name>`, never its phases.
- **Epic**: a spec of specs, with `00-overview.md` and **no phase files**. The
  ordering lives on the members. See `.claude/skills/spec-epic-next/epics.md`.

## Header fields

- `> **Name:**`: the folder name, the handle passed to the lifecycle skills.
- `> **Author:**`: `git config user.name` at creation.
- `> **Developer:**`: `—` until `/spec-start`, then the builder.
- `> **Status:**`: the lifecycle status.
- `> **Gating:**`: only where gating is configured. A flag name, or
  `none: <reason>`.
- `> **Severity:**`: on bug, hotfix and incident specs, Azure's literal values
  (`1 - Critical` … `4 - Low`).
- `> **Incident:**`: on a fix for an open incident: `incident-<name>`.
- `> **Epic:**`: on an epic member: `epic-<name>`.
- `> **Waits on:**`: on an epic member: `<spec>` or `<spec> phase N`,
  comma-separated, or `none`. A phase file may carry its own. It is met only on
  the base branch.
- `> **Lanes:**`: on an epic, optional: how many members may be in flight at
  once.
- `> **Product:**`: optional: the product the spec belongs to, where one
  tracker project holds several. A key from the provider's config, which
  decides what it means there (Azure Boards: `azure.products` maps it to an
  area path).
- `> **Run:**`: optional: `auto` or `supervised`, only where the spec differs
  from `auto.default` in `env.config.json`. A flag on the command overrides it.
- `> **Blocked on:**`: on a spec or a phase file: a wait outside the repo, in
  free text, optionally with `(until YYYY-MM-DD)`. Only a person can judge it
  met. `/spec-resume` clears it.

**Under a provider's default `pull`**, `Status:`, `Developer:` and the State log
are the tracker's: write none of them, and add `> **Tracker:** <url>` instead.
Lines that already exist stay as history.

## State log

A table of folder and status transitions. Each lifecycle skill appends exactly
one row when it changes state:

```
## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-01-01 | Draft | backlog | Jane Dev |
| 2026-01-02 | In Progress | in-progress | Jane Dev |
```

State moves go here. Decisions and course corrections go in the **Changelog**.

## Finding specs

The bucket folders are the source of truth for status. Under
`land.specDocs: "branch"` a spec is not on the base branch until it lands, so
`gating check` and `epic status` also read the spec branches (local, then
remote-tracking, never fetching). There are no index files.

## Rules

- If a spec already exists, update it. Do not rewrite it from scratch.
- Preserve completed `[x]` tasks, and never delete historical notes.
- Add new tasks to the appropriate phase.
- The spec file is the single source of truth for implementation progress.
- Move specs between buckets with `git mv`.
- Never let `**bold**`, `*italic*` or `[text](url)` cross a hard line break.
  Let the line overflow instead.
