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

  // The three-way merge engine's on-disk state.
  "sync": {
    // Committed base sidecar dir: the last-synced snapshot per spec, as
    // {baseDir}/{identifier}.base.json. Committed so each worktree carries its
    // own base and the divergence check stays accurate.
    "baseDir": "specs/.core/linear-base",

    // Backup-before-force lands the about-to-be-clobbered side here (the
    // reflog). --force never destroys without first writing a copy.
    "backupDir": "specs/.core/linear-backups",

    // Per-field sync direction — collapses which fields can ever conflict:
    //   "both" — co-authored: push + pull, may conflict (both moved off base).
    //   "pull" — Linear→local only (e.g. status/priority); a local edit never
    //            pushes and a conflict resolves to remote-wins.
    //   "push" — local→Linear only; a remote edit never pulls and a conflict
    //            resolves to local-wins.
    // Any field key you add here joins the compared field set; a value outside
    // both|pull|push is rejected at load time. The default set is scoped to the
    // fields that round-trip through the live skill today: the whole spec body
    // travels as `description`; status/priority/labels are Linear-owned (pull).
    // A phase/milestone or per-issue round-trip is a future extension — opt in by
    // adding `milestones`/`phaseBodies`/`taskBreakdown` here once that write path
    // exists (see the deferred body write-back note in the package README).
    "fieldOwnership": {
      "description": "both",
      "workflowState": "pull",
      "priority": "pull",
      "labels": "pull"
    },

    // Markdown sections of 00-overview.md that are local-only scaffolding and
    // are stripped from the pushed `description` (never sent to Linear).
    "localOnlySections": ["State log", "Changelog", "Open questions"],

    // OPT-IN body round-trip. Map a keyed collection field → its item id key to
    // sync it per item (each phase ↔ a Milestone, each task ↔ an Issue) instead of
    // as one description blob. Empty by default. See "Body round-trip" below.
    "keyedFields": {}
  }
}
```

## Body round-trip (milestones & tasks) — opt-in

By default the whole spec body travels as the project **`description`**. Opt a
workspace into a finer-grained, bidirectional sync by adding the keyed fields:

```jsonc
"sync": {
  "fieldOwnership": { "milestones": "both", "tasks": "both" },
  "keyedFields": { "milestones": "id", "tasks": "id" }
}
```

With this on:

- **Phases ↔ Milestones.** Each phase file maps to a Linear Milestone. The link id
  lives in the phase file's frontmatter (`linear_milestone_id`); its title ← the
  phase h1, its description ← the phase `**Goal:**` line. The `Phases` index is
  then stripped from the pushed `description` (no duplication).
- **Tasks ↔ Issues.** Each `- [ ]` task line maps to a Linear Issue. The link id
  is carried **inline** on the line — `- [ ] do the thing (SKI-123)`. Text ↔ the
  issue title; `[x]`/`[ ]` ↔ a completed / non-completed issue state.
- **Per-item merge.** Items are compared by id, so editing milestone A locally and
  milestone B in Linear both apply; only the *same* item moving on both sides is a
  conflict.
- **Deletions are report-only.** A phase/milestone or task/issue removed on either
  side is surfaced by `/spec-status` (and the pull/push summaries) for you to
  resolve by hand — it is never auto-deleted.

Unlinked local items (a new phase with no `linear_milestone_id`, a task with no
inline id) are created in Linear on the next `/spec-push`, which stamps the new id
back so they link from then on.

## Field ownership & conflicts

The spec is a set of structured fields, most written by only one side. Marking a
field's owner collapses which fields can genuinely conflict:

- A `pull` field (Linear owns it) never reports as **pushable** — a stray local
  edit is informational and gets reverted on the next pull.
- A `push` field (the repo owns it) never reports as **pullable**.
- Only a `both` field where **both** sides moved off the committed base is a real
  `conflict` — `/spec-push` / `/spec-pull` refuse it unless `--force` (which
  backs up the losing side into `sync.backupDir` first).

After any successful pull/push/force the engine **rewrites the base** so the next
three-way compare starts clean.

## What to commit

- **`sync.baseDir`** (default `specs/.core/linear-base/`) — **commit it.** The base
  sidecar is the last-synced snapshot the three-way merge compares against; each
  worktree carries its own base, so it must travel with the branch.
- **`sync.backupDir`** (default `specs/.core/linear-backups/`) — **gitignore it.**
  These are `--force` recovery copies (a local reflog), per-machine and not shared.
  Add `specs/.core/linear-backups/` to your `.gitignore`.
