# `linear.config.json` — Linear one-way sync config

Opt-in config for the Linear sync (`/spec-status`, `/spec-push`, and the
Linear-aware paths of `/spec` and `/spec-go`). Sync is **one-way**: the repo is
the source of truth and the Linear **issue** is a **generated mirror**. A spec is
a Linear issue and each phase a sub-issue; tasks are not synced. Content is
pushed up and never read back or merged — `/spec-push` diffs the spec against a
committed **last-pushed snapshot** and applies only what changed; `/spec-status`
is a read-only drift report. The `sync.fieldOwnership` map now just selects the
projection field set (every field is repo-owned and pushed).

**Every Linear step is gated on this file.** While `specs/.core/linear.config.json`
is absent the feature is simply unused — `/spec`, `/spec-go`, and the CLI's
`spec-sync` subcommands behave exactly as they do today (local-only). Adopt it by
copying `linear.config.json.example` → `linear.config.json` here and filling in
your team ID (and an optional grouping project).

The loader (`src/sync/config.js` → `loadLinearConfig`) merges your file over the
frozen defaults below and returns `{ config, present }`; `present:false` means no
live `linear.config.json` was found (the opt-in gate — it never throws on
absence). A `sync.fieldOwnership` value outside `both|pull|push` is a hard error.

## Fields

```jsonc
{
  // Which Linear team specs sync into, and an optional Project to group them.
  // IDs are read by the MCP adapter; leave blank until you connect the `linear`
  // MCP server.
  "linear": {
    "teamKey": "",        // human-facing key, e.g. "ENG" (optional)
    "teamId": "",         // Linear team UUID (the issue's team)
    "projectId": ""       // DEFAULT for the project picker (see below)
  },

  // Issue intake: `/spec <ISSUE-REF>` adopts any issue; `/spec --from-issue`
  // browses the inbox. Both optional.
  "intake": {
    "label": "",          // inbox filter — the label the web app files under
    "bugLabels": []       // e.g. ["bug"] — these route to /spec-bug instead
  },

  // How a spec's parts map onto Linear objects: a spec is an Issue, each phase a
  // sub-issue (a child issue), tasks are not synced. These are the defaults.
  "mapping": {
    "specFolder": "issue",
    "phases": "subissue",
    "tasks": "none"
  },

  // Map the spec's lifecycle bucket → the Linear ISSUE workflow-state name. Used
  // for the spec issue's state (from its folder) AND each sub-issue's state (from
  // the phase emoji). Names must match the workspace's issue states exactly.
  "states": {
    "backlog": "Backlog",
    "in-progress": "In Progress",
    "complete": "Done",
    "cancelled": "Canceled"
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
    // is retained for shape; there is no pull. The default set is the spec
    // issue's `description`, its `subIssues` (one per phase — name + goal +
    // state), and the lifecycle `workflowState`. Tasks, priority, labels, cycles
    // and comments are NOT here, so a PM's triage is never touched. Any key you
    // add joins the pushed projection.
    "fieldOwnership": {
      "description": "push",
      "subIssues": "push",
      "workflowState": "push"
    },

    // Markdown sections of 00-overview.md that are local-only scaffolding and
    // are stripped from the pushed `description` (never sent to Linear).
    "localOnlySections": ["State log", "Changelog", "Open questions"],

    // Reserved. Sub-issues are always projected per phase, so this no longer
    // needs setting; it is validated but unused. Leave it `{}`.
    "keyedFields": {}
  }
}
```

## Spec → Issue, phases → sub-issues

Push maps the spec's structure to Linear's, keyed by id so it updates rather than
recreates:

- **Spec → Issue.** The spec is one Linear issue. Its id lives in the overview
  frontmatter (`linear_identifier`); its `description` ← the overview plan (with
  the `Phases` index and local-only sections stripped); its workflow-state ← the
  spec's lifecycle folder (`specs/<bucket>/`).
- **Phases → sub-issues.** Each phase file maps to a child issue (`parentId` = the
  spec issue). The link id lives in the phase file's frontmatter
  (`linear_issue_id`); its title ← the phase h1, its description ← the phase
  `**Goal:**` line, its state ← the phase heading emoji (⬜/🔄/✅).
- **Tasks are not synced.** Task checkboxes stay in the repo phase files only.

Unlinked local items (a spec with no `linear_identifier`, a phase with no
`linear_issue_id`) are created in Linear on the next `/spec-push`, which stamps
the new id back so they link from then on.

## Which Project a spec issue belongs to

`linear.projectId` is the **default**, not a mandate. When a spec issue is first
created — by `/spec`, or by the first `/spec-push` if the spec was authored
offline — you're offered the team's projects, filterable by name, with an explicit
**None (team only)** option and this id pre-selected.

The choice is passed on the **create call only**. It is never written into the
spec, never recorded in the snapshot, and never sent on an update. So once the
issue exists, where it lives is Linear's business: move it between projects and
`/spec-status` will not call it drift and `/spec-push` will not move it back.

A spec that **adopted** an existing issue (see below) skips the picker entirely —
it was filed somewhere deliberately.

## Starting a spec from an existing issue

With `intake` configured, a spec can begin life as a Linear issue someone else
filed:

- `/spec SKI-123` — adopt that issue.
- `/spec --from-issue [query]` — browse issues labelled `intake.label` (what your
  web app or feedback form files under), optionally filtered by title.

The issue **becomes** the spec's issue: its identifier is stamped as
`linear_identifier`, phases become its sub-issues, and the first `/spec-push`
replaces its description with the spec. The reporter's comments, links and
subscribers stay on the one issue everyone is already watching; their original
words are carried into the spec's **Problem** section.

An issue already stamped on a spec can't be adopted twice — `skitterspec spec-sync
linked` is the list that's checked. An issue labelled with one of
`intake.bugLabels` routes to `/spec-bug` instead, which adopts it identically.

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
