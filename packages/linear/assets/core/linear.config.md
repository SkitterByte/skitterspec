# `linear.config.json` — Linear one-way sync config

Opt-in config for the Linear sync (`/spec-status`, `/spec-push`, and the
Linear-aware paths of `/spec` and `/spec-go`). Sync is **one-way**: the repo is
the source of truth and the Linear **issue** is a **generated mirror**. A spec is
a Linear issue and each phase a sub-issue; a phase's tasks ride along inside
that sub-issue's description as a read-only checklist. Content is
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
  // browses the inbox. All optional.
  "intake": {
    "label": "",          // inbox filter — the label the web app files under
    "bugLabels": [],      // e.g. ["bug"] — these route to /spec-bug instead
    "hotfixLabels": []    // e.g. ["production"] — these route to /spec-hotfix
  },

  // How a spec's parts map onto Linear objects: a spec is an Issue, each phase a
  // sub-issue (a child issue). `tasks` selects how a phase's checkboxes reach
  // that sub-issue: "checklist" mirrors them into its description (default),
  // "none" leaves the description as the phase's Goal line alone. Either way no
  // issue is created per task. These are the defaults.
  //
  // `phases` selects WHEN a phase becomes a sub-issue: "subissue" from the
  // spec's first push (default), or "deferred" only once the work starts — see
  // "Deferring sub-issues until a spec starts" below.
  //
  // Under "checklist" the mirror keeps the phase file's OWN section headings: a
  // phase with `## Tasks` and `## Acceptance` arrives as two headed sections, in
  // source order, each heading reproduced as written. Checkboxes written before
  // any heading appear under `## Tasks`. A heading with no checkboxes under it
  // is not mirrored. Nesting, sub-bullets and inline formatting are preserved;
  // a legacy inline `(KEY-123)` on a task line is stripped.
  "mapping": {
    "specFolder": "issue",
    "phases": "subissue",
    "tasks": "checklist"
  },

  // Map the spec's lifecycle bucket → the Linear ISSUE workflow-state name. Used
  // for the spec issue's state (from its folder) AND each sub-issue's state (from
  // the phase emoji). Names must match the workspace's issue states exactly —
  // Linear silently IGNORES an unknown state, so a typo pushes clean and the
  // issue never moves. `/spec-push` fetches the workspace's names and `push`
  // refuses to run without them, so a wrong name here fails loudly rather than
  // quietly. (Upgrading from 8.x? The right value inverts: the project status
  // `Completed` becomes the issue state `Done`.)
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
  `**Goal:**` line plus its task checklist (see below), its state ← the phase
  heading emoji (⬜/🔄/✅).
- **Tasks are mirrored, not synced.** With `mapping.tasks: "checklist"` (the
  default) a phase's checkboxes are rendered into its sub-issue's description as
  a markdown checklist — nesting and `[x]` state preserved, any legacy inline
  `(KEY-123)` stripped. No issue is created per task and nothing is read back, so
  a box ticked in Linear is overwritten by the next push. Set `"none"` to keep
  the description as the Goal line alone.

  Turning this on (or off) changes every sub-issue's description, so the first
  `/spec-push` afterwards reports every already-linked sub-issue as an update.
  That is expected — they update in place and no duplicates are minted.

Unlinked local items (a spec with no `linear_identifier`, a phase with no
`linear_issue_id`) are created in Linear on the next `/spec-push`, which stamps
the new id back so they link from then on.

## What is reshaped before sending, and what is checked afterwards

Two safeguards sit either side of the push. Neither is configurable — both exist
because Linear's markdown parser does not always store what it is given.

**Nested tables are reshaped.** A markdown table written *inside* a list item is
corrupted by Linear: every data cell loses its first N characters, N being the
list-content indent Linear renders at (3 per ordered level, 2 per bullet),
whatever indent the source used. The header row survives, which makes it easy to
miss. Measured, not inferred — a table at source indent 3, 4 or 6 inside a
numbered list loses exactly 3 characters per cell. So before sending, a nested
table is re-emitted as a **bullet list** (2 columns) or a **fenced code block**
(any other count), both of which round-trip byte-identically. Column-0 tables —
the `## Phases` index, every Impact map — are never touched, and neither are
tables inside a fenced example. **Your spec files are not modified**: the source
markdown is valid and renders correctly in GitHub and every editor, so this
shapes only the projection.

**The round-trip is verified.** After `/spec-push` applies a plan it reads each
description back and runs `spec-sync verify`, which compares word characters and
ignores the reformatting Linear legitimately applies (renumbered ordered lists,
`-`→`*`, collapsed table separators, checkbox case, whitespace). Anything lost or
altered is reported with both sides of the first difference. It warns rather than
fails — the repo is unaffected and re-pushing overwrites the mirror. This is not
a pull: nothing read back is merged, stamped or written anywhere.

## How the push reaches Linear — `auth` and `apply`

By default `/spec-push` applies its plan **over MCP**: the assistant makes one
`save_issue` call per object. That works with no setup at all — MCP carries the
Linear session you are already signed into — but it means every issue description
is generated as output tokens, and read back the same way, so a large push is
bounded by the model rather than by Linear.

Set a **Linear personal API key** and the engine talks to Linear directly
instead:

```bash
export LINEAR_API_KEY=lin_api_…      # from Linear → Settings → Security & access

Or store it once, for every repo on the machine, instead of exporting it in each:

```
skitterspec spec-sync credentials set        # prompts; input is hidden
skitterspec spec-sync credentials status     # readiness only, never the value
skitterspec spec-sync credentials unset      # remove this team's key
```

That writes `$XDG_CONFIG_HOME/skitterspec/credentials.json` (else
`~/.config/…`) at mode `600`, keyed by team id. Resolution order is **environment
variable first, then the store**, so CI is unaffected. A store readable by other
users is refused with the `chmod` to run rather than used.

`set` reads the key from a hidden prompt, or from a pipe with `--stdin`. There is
deliberately **no `--key <value>` flag**: a secret in the command line is visible
in shell history and to `ps`. For the same reason, run `set` yourself — never
paste a key into an assistant conversation, where it would enter the transcript.
`status` exists so an assistant can confirm readiness without ever seeing the
key.

### Delegating to a password manager

Rather than storing the key at all, record a **command** that prints it. A
command is not a secret, so unlike `--key` it is safe as an argument:

```
# 1Password CLI
skitterspec spec-sync credentials set --command 'op read op://Private/linear/token'

# pass
skitterspec spec-sync credentials set --command 'pass show linear/api-key'

# macOS Keychain (add once: security add-generic-password -s skitterspec -a linear -w)
skitterspec spec-sync credentials set --command 'security find-generic-password -w -s skitterspec -a linear'
```

The command runs on each resolution; its stdout, trimmed, is the key. A non-zero
exit or empty output means "no key", which simply falls back to MCP — with the
reason shown by `credentials status`, so a broken command is never silently
inert. It has 60 seconds to complete, enough for a biometric or master-password
prompt. Recording a command replaces any stored key for that team, so the
command actually runs.

A command with a key written into it (`--command 'echo lin_api_…'`) is
**refused**: commands are displayed by `status` and stored in clear, so that is
strictly worse than storing the key. Use `credentials set` for a key.

> **`keyCommand` is honoured only from the user-level store — never from
> `specs/.core/linear.config.json`.** That file is committed and travels with the
> repo, so a command named there would run on the machine of anyone who cloned it
> and ran `spec-sync`. If one is found there it is ignored, and `credentials
> status` says so.
```

```json
"auth":  { "keyEnv": "LINEAR_API_KEY" },
"apply": { "transport": "" }
```

- **`auth.keyEnv`** names the environment variable the key is read from.
  It names the **variable, never the key** — nothing secret is ever written to
  this file or to the repo.
- **`apply.transport`** pins the transport: `"api"`, `"mcp"`, or `""` (the
  default) to decide per run — the API when a key is present, MCP when it isn't.
  `spec-sync apply --via <api|mcp>` overrides it for one run.

With a key present, `/spec-push` runs a single `spec-sync apply`, which writes,
reads back what Linear stored, stamps the ids into your spec and records the
snapshot. Descriptions never pass through the assistant in either direction.

**An interrupted run is safe to repeat.** Each id is written into the spec as soon
as its object exists, so re-running applies only what is still missing.
It never mints a second copy of an issue it already created. There is no ledger
to keep in step; the spec files are the record.

Without a key, nothing changes: the MCP path is fully supported and remains the
default for anyone who never sets one.

## How phases are mirrored — `mapping.phases`

`mapping.phases` decides *whether and when* a phase becomes a sub-issue:

- `"subissue"` (default) — from the spec's first push. A spec costs `1 + N`
  `save_issue` calls to mirror, N being its phase count.
- `"deferred"` — only once the work starts. A spec sitting in `specs/backlog/`
  mirrors as **the issue alone**; its sub-issues are created by the push that
  follows `/spec-go`.
- `"inline"` — never. Each phase becomes a **section of the spec issue's own
  description**, with its full task list, and the `## Phases` index stays as the
  table of contents. One issue per spec, however many phases it has.

### One mode, or one per bucket

Either form is valid:

```json
"mapping": { "phases": "subissue" }
```

```json
"mapping": {
  "phases": { "backlog": "subissue", "in-progress": "subissue", "complete": "inline" }
}
```

A **scalar** applies one mode to the whole repo — that is what every config was
before per-bucket mapping, and it still means exactly what it meant. A **map**
keys the mode by the spec's lifecycle bucket: `backlog`, `in-progress`,
`complete`, `cancelled`. A bucket the map **omits defaults to `subissue`**, so a
partial map adds an exception for the buckets it names rather than quietly
changing the ones it does not.

An unknown key or an unknown mode is a **loud error** at load, not a fallback: a
misspelt `"completed"` that read as "the map said nothing" would go on minting
exactly the sub-issues the config was written to stop, and look deliberate doing
it.

Why per bucket rather than per repo: phases became sub-issues so that parallel
agents could be assigned one each. That reasoning holds for work in flight and
does not hold for work that finished long ago — a repo with 250 completed specs
gets 669 sub-issues nobody will ever read. Set `complete: "inline"` and those
mirror as 250 readable issues, while the backlog keeps the assignable sub-issues
that made the choice worth it.

### Switching modes is non-destructive

**A phase already carrying a `linear_issue_id` keeps its sub-issue in every
mode**, and is never *also* inlined. One-way sync has no delete op, so
withholding a live sub-issue would not remove it from Linear — it would freeze it
there, never updated again. So changing `mapping.phases` only ever changes what
has yet to be minted, and a spec part-way through keeps a coherent mirror.

**Adopting on an established repo:** set `complete: "inline"` (and `"deferred"`
or `"inline"` for `backlog`) **before** the first backfill push. Finished specs
then never mint sub-issues at all, rather than minting them and stranding them.


Deferral is worth setting when you adopt sync on a project that already has a
long backlog, where the default means mirroring every phase of every spec nobody
has started yet — in this repo, 130 calls where 35 would do.

What defers and what does not:

- **Unlinked phases defer; linked ones never do.** A phase already carrying a
  `linear_issue_id` keeps projecting whatever the mode. One-way sync has no
  delete, so withholding a live sub-issue would not remove it from Linear — it
  would freeze it there, never updated again. That makes switching an existing
  project to `"deferred"` safe: it only changes what has yet to be minted.
- **The trigger is the spec's projected state**, not its folder alone — so a
  `spec_status` frontmatter override moves the issue's state and its sub-issues
  together. Phases defer while that state is `backlog` or `cancelled`; a spec
  cancelled without ever starting never mints phases it never worked, while one
  cancelled mid-flight has ids already and keeps them.
- **A deferred spec keeps its `## Phases` index in the description.** That
  section is normally stripped because the sub-issues carry it; while they are
  withheld it is the only place the phase breakdown appears. It drops out of the
  description in the same push that creates the sub-issues.
- **`/spec-push` and `/spec-status` say so**, printing `N phase(s) deferred`, and
  the JSON plan carries a `phasesDeferred` count — a spec with no sub-issues
  reads as deliberate rather than as phase files that failed to parse.
- **Both also print the resolved mode** as `phases: <mode>` whenever it is not
  the default, naming the bucket it resolved through, and the JSON plan always
  carries it as `phaseMode`. With a per-bucket map the config alone no longer
  tells you which mode a given spec got, so the report is where that is stated.

There is no snapshot state behind this and nothing to migrate: the last-pushed
snapshot only ever recorded sub-issues that have an id, so a deferred phase is
simply absent from it and arrives as an ordinary `create` when it projects.

### What `inline` renders

Each unlinked phase is appended to the description as a `###` section carrying
the **same body its sub-issue would have had** — the identical composer, so
`inline` inherits every fidelity guarantee the sub-issue form has rather than
being a second, thinner projection. The body's own headings are demoted to nest
under that `###` (a phase's `## Tasks` would otherwise read as a sibling of the
spec's `## Problem` and drag every later phase under it).

```markdown
## Phases

| # | Phase | Status | File |
| 1 | Mode resolver | ✅ | [01-mode-resolver.md](01-mode-resolver.md) |

### Phase 1 — Mode resolver ✅

**Goal:** one resolver decides the mode for a spec.

#### Tasks

- [x] Extend the config loader
```

The phase heading is the phase file's h1 **as written**, emoji included: a
sub-issue projects its title as `name` and its status emoji as `state`, and
inlined there are no such fields for either to live in.

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

### Known limits — one team per repo, no initiatives

Two things this config deliberately cannot express today. Both are limits, not
oversights; `/spec-linear-setup` says so during setup rather than letting you
find out later.

**One team per repo.** `linear.teamId` is a single value, so every spec in a repo
files into the same Linear team. If your workspace runs a team per product and a
repo genuinely spans two of them, sync has no way to say that — pick the team
that owns most of the work, or split the specs across two checkouts. (Splitting
products by **project** inside one team has no such limit: that is what
`projectId` and the picker are for.)

**Initiatives are not used for placement.** A spec issue attaches to a team and
optionally a project — never to an initiative. If your projects are grouped under
initiatives the grouping still works in Linear; you just pick the project inside
the initiative, and the initiative follows from it. What's missing is *filtering
the picker* by initiative, which would matter to a workspace with enough projects
that the flat list stops being useful. The hook is already there when it does:
Linear's `list_projects` accepts an `initiative` filter, and the API adapter's
`listProjects` (`src/api.js`) queries `team(id) { projects }` sending none.

## Starting a spec from an existing issue

With `intake` configured, a spec can begin life as a Linear issue someone else
filed:

- `/spec SKI-123` — adopt that issue.
- `/spec --from-issue [query]` — browse issues labelled `intake.label` (what your
  web app or feedback form files under), optionally filtered by title.
- `/spec-bug SKI-123` — same, for a bug.
- `/spec-hotfix v33.16.4 SKI-123` — same, for a bug that has to be patched on a
  released version. Give the tag or be asked for it; any version the report
  mentions is offered as a suggestion, never used as a default.

The issue **becomes** the spec's issue: its identifier is stamped as
`linear_identifier`, phases become its sub-issues, and the **linking push**
— which runs as the spec is created — replaces its description with the spec. The
reporter's comments, links and subscribers stay on the one issue everyone is
already watching; their original words are carried into the spec's **Problem**
(or **Symptom**) section, and Linear keeps the original in the issue's history.

An issue already stamped on a spec can't be adopted twice — `skitterspec spec-sync
linked` is the list that's checked.

### Routing an issue to the right skill

Two optional label lists send an issue to a more specific skill, checked in this
order:

| List | Routes to | Means |
|------|-----------|-------|
| `intake.hotfixLabels` | `/spec-hotfix` | broken in production — patch the released version |
| `intake.bugLabels` | `/spec-bug` | a bug, fixed on `main` like any other |

**`hotfixLabels` wins when an issue carries both.** The two mistakes are not
equally costly: routing a production issue to `/spec-bug` produces a fix that
lands on `main` and never reaches the running version — noticed only when someone
asks why it hasn't shipped. The reverse is a hotfix branch for something that
could have waited.

`/spec-bug` still checks `hotfixLabels` — being in the bug path is not a reason to
miss that production is broken. `/spec-hotfix` checks neither; it is already the
most specific destination. Leave a list empty and nothing routes through it.

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
