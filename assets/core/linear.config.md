# `linear.config.json` — Linear hybrid-sync config

Opt-in config for the git-like Linear sync (`/spec-status`, `/spec-pull`,
`/spec-push`, and the Linear-aware paths of `/spec` and `/spec-go`). Linear owns
**status and discussion**; the repo stays the **co-authoring surface for spec
content**. Sync is bidirectional but git-like: explicit commands, a committed
**base sidecar** for three-way merge, and no blind overwrites.

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
    // both|pull|push is rejected at load time.
    "fieldOwnership": {
      "description": "both",
      "milestones": "both",
      "phaseBodies": "both",
      "acceptanceCriteria": "both",
      "taskBreakdown": "both",
      "workflowState": "pull",
      "priority": "pull",
      "labels": "pull"
    },

    // Markdown sections of 00-overview.md that are local-only scaffolding and
    // are stripped from the pushed `description` (never sent to Linear).
    "localOnlySections": ["State log", "Changelog", "Open questions"]
  }
}
```

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
