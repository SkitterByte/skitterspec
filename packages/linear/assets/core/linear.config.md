# `linear.config.json` — Linear one-way sync config

Opt-in config for the Linear sync (`/spec-status`, `/spec-push`, and the
Linear-aware paths of `/spec` and `/spec-go`). Sync is **one-way**: the repo is
the source of truth and the Linear project is a **generated mirror**. Content is
pushed up and never read back or merged — `/spec-push` diffs the spec against a
committed **last-pushed snapshot** and applies only what changed; `/spec-status`
is a read-only drift report. The `sync.fieldOwnership` map now just selects the
projection field set (every field is repo-owned and pushed).

**Every Linear step is gated on this file.** While `specs/.core/linear.config.json`
is absent the feature is simply unused — `/spec`, `/spec-go`, and the CLI's
`spec-sync` subcommands behave exactly as they do today (local-only). Adopt it by
copying `linear.config.json.example` → `linear.config.json` here and filling in
your team / initiative IDs.

The loader (`src/sync/config.js` → `loadLinearConfig`) merges your file over the
frozen defaults below and returns `{ config, present }`; `present:false` means no
live `linear.config.json` was found (the opt-in gate — it never throws on
absence). A `sync.fieldOwnership` value outside `both|pull|push` is a hard error.

## Fields

```jsonc
{
  // Which Linear team/initiative specs sync into. IDs are read by the Phase 2
  // MCP adapter; leave blank until you connect the `linear` MCP server.
  "linear": {
    "teamKey": "",        // human-facing key, e.g. "ENG" (optional)
    "teamId": "",         // Linear team UUID (create target)
    "initiativeId": ""    // optional Initiative that groups these specs
  },

  // How a spec's parts map onto Linear objects. Defaults mirror Decision 7:
  // spec folder → Project, phases → Milestones, tasks → Issues. `phases` may be
  // switched to "issue" if your workspace doesn't expose project milestones.
  "mapping": {
    "specFolder": "project",
    "phases": "milestone",   // "milestone" | "issue"
    "tasks": "issue"
  },

  // Map the spec's lifecycle bucket → the Linear workflow-state name. Used when
  // translating workflowState across the boundary (Linear owns status → `pull`).
  "states": {
    "backlog": "Backlog",
    "in-progress": "In Progress",
    "complete": "Done",
    "cancelled": "Cancelled"
  },

  // The spec's entry-point file the local snapshot + frontmatter live in.
  "snapshot": {
    "overviewFile": "00-overview.md"
  },

  // Git branch name derived for a linked spec. Tokens: {type}, {slug},
  // {identifier} (the Linear issue/project identifier, e.g. ENG-123). Shared
  // with the isolation engine's branch derivation (src/env/resolve.js).
  "branch": {
    "pattern": "{type}/{slug}"
  },

  // One-way push engine state.
  "sync": {
    // Committed last-pushed snapshot dir: content hashes of the last push per
    // spec, as {baseDir}/{identifier}.base.json. Committed so each worktree
    // carries its own, and push knows what changed without reading Linear back.
    "baseDir": "specs/.core/linear-base",

    // The pushed projection field set (repo → Linear, one-way). The `push` marker
    // is retained for shape; there is no pull. The default set is the project
    // `description`, `milestones` (one per phase), `tasks` (one issue each), and
    // the lifecycle `workflowState`. Priority, labels, cycles and comments are
    // Linear-native triage — deliberately NOT here, so a PM's triage is never
    // touched. Any key you add joins the pushed projection.
    "fieldOwnership": {
      "description": "push",
      "milestones": "push",
      "tasks": "push",
      "workflowState": "push"
    },

    // Markdown sections of 00-overview.md that are local-only scaffolding and
    // are stripped from the pushed `description` (never sent to Linear).
    "localOnlySections": ["State log", "Changelog", "Open questions"],

    // Reserved. Milestones and tasks are always projected per item (each phase →
    // a Milestone, each task → an Issue), so this no longer needs setting; it is
    // validated but unused. Leave it `{}`.
    "keyedFields": {}
  }
}
```

## Phases → Milestones, tasks → Issues

Push maps the spec's structure to Linear's, keyed by id so it updates rather than
recreates:

- **Phases → Milestones.** Each phase file maps to a Linear Milestone. The link id
  lives in the phase file's frontmatter (`linear_milestone_id`); its name ← the
  phase h1, its description ← the phase `**Goal:**` line. The `Phases` index is
  stripped from the pushed `description` (no duplication).
- **Tasks → Issues.** Each `- [ ]` task line maps to a Linear Issue. The link id
  is carried **inline** on the line — `- [ ] do the thing (SKI-123)`. The issue
  **title** is the task's first sentence; the **description** is the full task
  text; `[x]`/`[ ]` ↔ a completed / non-completed issue state.

Unlinked local items (a new phase with no `linear_milestone_id`, a task with no
inline id) are created in Linear on the next `/spec-push`, which stamps the new id
back so they link from then on.

## One direction — nothing to reconcile

The repo owns the spec and pushes it; there is no pull. `/spec-push` diffs the
current spec against the committed **last-pushed snapshot** and sends only what
changed — creates for unlinked items, updates for changed ones. A workflow-state a
teammate moves in Linear is surfaced by `/spec-status` as **drift** (advisory) and
overwritten on the next push. Priority, labels, cycles and comments are
Linear-native triage and are never touched. No base merge, no conflicts, no
`--force`.

## What to commit

- **`sync.baseDir`** (default `specs/.core/linear-base/`) — **commit it.** The
  last-pushed snapshot is content hashes of the last push, so `/spec-push` knows
  what changed without reading Linear back; each worktree carries its own, so it
  must travel with the branch.
