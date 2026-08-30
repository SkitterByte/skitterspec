---
name: spec-push
description: Push a spec up to its linked Linear issue (repo → Linear, one-way). The repo is the source of truth; Linear is a generated mirror. A spec is a Linear issue and each phase a sub-issue, with the phase's tasks mirrored read-only into that sub-issue's description. Runs `skitterspec spec-sync push` to get a create/update plan, then applies it with `spec-sync apply` — straight to Linear's API when a key is set (descriptions never pass through the model), or over MCP when it isn't — stamping the returned ids back into the spec and recording the snapshot. Never merges Linear content back. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-push", "push to Linear", "update the Linear issue from this spec".
---

# /spec-push — send a spec up to Linear (one-way)

Repo → Linear. The repo is the **source of truth**; Linear is a **generated
mirror**. A spec is a Linear **issue**; each phase is a **sub-issue** (a child
issue), and the phase file is mirrored into that sub-issue's description as
written — its prose, its sections, and its tasks as a read-only checklist, never
as issues of their own. Only the phase's h1 and `> **Status:**` line are left
out, because both are pushed as fields of their own (the sub-issue's title and
state). This skill
computes what changed since the last push and applies it — it never reads Linear
content back or merges. A person editing the mirror in Linear will see it
overwritten on the next push.

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Pick the transport, and get the workspace states

**Ask the engine first — it decides, not you:**

```
skitterspec spec-sync states --json
```

With a Linear API key set (`LINEAR_API_KEY`, or whatever `auth.keyEnv` names) the
engine talks to Linear directly. That is the **fast path**, and it is the default
whenever a key is present: descriptions never pass through you, in either
direction. Without a key it falls back to MCP and everything below works as it
always has.

- **`transport = api`** → the command prints the workspace's state names as a
  JSON array. Write it to a file and carry on to step 3.
  **Skip the MCP tool discovery entirely** — you make no Linear calls here.
- **`transport = mcp`** → do the MCP work: discover the issue
  **read + create/update** tools at runtime (`get_issue`, `save_issue` — a single
  upsert covers create and update), plus the **project list** tool if this push will
  mint the spec issue (see the picker below — optional; without it the picker is
  skipped, not failed). If Linear isn't connected or a needed tool is missing,
  relay the fix and stop, **writing nothing**. Then fetch the workspace's issue
  workflow-state **names** yourself and write them to a file as a JSON array
  (e.g. `["Backlog","In Progress","Done","Canceled"]`).

Either way you end up with a states file. Step 3 requires it:
`push` **refuses to run** without one, because Linear silently ignores an unknown
issue state — the description lands, the issue never moves, and nothing errors.
If the check reports a name that isn't in the workspace, stop and fix
`specs/.core/linear.config.json`.

**If the check refuses, offer to fix it.** The refusal lists every configured
name the workspace lacks, the workspace's real state names, and — where the
bucket makes it unambiguous — which one to use instead. Relay that, then offer to
apply it to `specs/.core/linear.config.json` → `states`, and do so on the user's
confirmation. Never edit their config without asking, and never guess a bucket
the refusal made no suggestion for — ask which state they want.

`--skip-state-check` exists for the deliberate exception; do not reach for it to
get past a failing check.

## 3. Get the plan from the engine

```
skitterspec spec-sync push <spec> --workspace-states <file> --json
```

The engine prints a JSON **plan** (no network, no remote read):

```json
{
  "issue": { "description": "…", "state": "in-progress" },
  "subIssues": {
    "create": [{ "ref": "01-outbox", "name": "Outbox", "goal": "…", "state": "backlog" }],
    "update": [{ "id": "REU-2", "name": "…", "goal": "…", "state": "in-progress" }]
  }
}
```

An empty plan (no `issue`, no sub-issue create/update) means the mirror is up to
date — say so and stop. `state` values are local buckets
(`backlog`/`in-progress`/`complete`/`cancelled`); map each to the Linear
issue-state NAME via `config.states` at apply time.

A **`phasesDeferred`** field means `mapping.phases` is `"deferred"` and this spec
has not started, so its phases are deliberately absent from the plan — the issue
pushes alone and the sub-issues are minted by the push that follows `/spec-go`.
Relay the count; it is not a sign the phase files failed to parse. Nothing else
about applying the plan changes.

The plan always carries a **`phaseMode`** field — `subissue`, `deferred` or
`inline` — the mode that resolved for THIS spec's lifecycle bucket.
`mapping.phases` may be a per-bucket map, so the config alone no longer tells you
which mode a given spec got. Relay it whenever it is not `subissue`:

- **`inline`** — no sub-issues are created at all. Each unlinked phase is a
  section of the spec issue's own description, and the `## Phases` index stays as
  its table of contents. A plan with no sub-issue creates is the expected shape,
  not a parse failure. A phase that already carries an id keeps its sub-issue and
  still appears under `subIssues` — apply those normally.
- **`deferred`** — as above; the `phasesDeferred` count says how many are waiting.

Nothing about how you apply the plan changes in either mode: apply exactly the
`issue` and `subIssues` the plan lists.

### Stop if the plan reports a pre-9.0 mirror

If the plan carries a **`legacy`** field, this spec was linked under the pre-9.0
model (`linear_project_id` / `linear_milestone_id`). v9 reads the new keys, finds
none, and the plan above is therefore **all-creates** — applying it mints a fresh
mirror and **abandons** the existing one. **Stop.** Relay `legacy.keys`,
`legacy.files` and `legacy.orphanCount` ("this would orphan N live objects"),
point at `MIGRATION.md` → "v8 → v9", and apply nothing until the user has
migrated or explicitly confirms they want a new mirror.

## 4. Apply the plan

**On `transport = api`, this is one command:**

```
skitterspec spec-sync apply <spec> --plan plan.json
```

It creates and updates the issue and its sub-issues, reads each description back
and runs the same check as step 4b, stamps every returned id into the spec, and
records the snapshot. **Steps 4a–5 below are then already done** — skip to step 6
and report what it printed, including the transport.

Two things it guarantees, so you don't have to manage them:

- **It writes nothing until everything checkable has been checked** — a legacy
  plan, a missing key, or a `config.states` name the workspace lacks all fail
  before the first write.
- **It stamps each id the moment its object exists.** If a run is interrupted,
  re-run the same command: the objects it already created are linked, so the new
  plan sees them as updates and no duplicate is minted. Never "start again" by
  hand.

If it prints **`transport = mcp`** it has written nothing and is telling you to
apply the plan yourself — do steps 4a, 4b and 5 below. Pass `--via mcp` to force
that deliberately.

If the picker is needed (a first push minting the issue), run it first and pass
the chosen project through as `--project <id>`.

## 4a. Apply it yourself — the MCP path (order matters)

1. **Spec issue** → if the overview has no `linear_identifier`, this push
   **mints** it: run the picker in **Picking the Linear Project** below, then
   create it with `save_issue` (`team` = `linear.teamId`; `project` = the picked
   id; `title` from the spec title; `description` from `plan.issue.description`;
   state from `plan.issue.state` via `config.states`). Keep the returned
   identifier and url for step 5 — don't hand-edit frontmatter. If it already
   exists and `plan.issue` is present, **update it by id and send no `project`**
   — its placement is Linear's from then on.
2. **Sub-issues create** → for each, `save_issue` with `parentId` = the spec
   issue id (`name` → title, `goal` → description, `state` via `config.states`).
   Keep each returned id against its `ref` (the phase-file basename).
3. **Sub-issues update** → `save_issue` by `id` (title/description/state).

Priority, labels, cycles and comments are Linear-native triage — do **not** push
them; they're the PM's.

## 4b. Verify what Linear actually stored — the MCP path

*(On the API path `apply` already did this. Skip.)*

Linear reserialises markdown on save, and it does not always preserve what you
sent — a table nested in a list item comes back with characters missing from
every data cell, silently. Check before you record the push as good.

For each issue you created or updated in step 4a, read its `description` back
(`get_issue`) and write what you got to a JSON file:

```json
{ "issue": "<stored description>", "subIssues": { "01-outbox": "<stored>" } }
```

Then:

```
skitterspec spec-sync verify <spec> --stored <file>
```

It compares against what the engine sent, ignoring the reformatting Linear
legitimately applies (renumbered ordered lists, `-`→`*`, collapsed table
separators, checkbox case, whitespace) and reporting only lost or altered **word
characters**. Relay any divergence — it prints both sides around the first
difference. It exits 0 either way: the repo is unaffected and still correct, so
this is a warning, not a failure.

This is **not a pull**. Nothing read here is merged, stamped, or written
anywhere; the repo remains the only source of truth. Do it before step 5 so a
corrupted push is visible before the snapshot records it as good.

## 5. Stamp the ids, then record the snapshot — the MCP path

*(On the API path `apply` already did both. Skip.)*

Write every id you collected back into the spec in **one** call — the engine
does the file edits, so there is no hand-editing of frontmatter:

```
skitterspec spec-sync stamp <spec> \
  --issue SKI-11 --url https://linear.app/… \
  --sub 01-outbox=SKI-12 --sub 02-api=SKI-13
```

Pass `--issue`/`--url` only on the push that minted the spec issue; pass one
`--sub <ref>=<id>` for every sub-issue **created** in step 4a.2 (updates already
have their id). It validates every ref and id **before** writing anything and
exits non-zero having changed nothing if any is wrong — so a typo can't leave the
spec half-stamped, pointing at an issue that isn't there. Fix what it reports and
re-run; it is safe to repeat.

Then record what was pushed:

```
skitterspec spec-sync record <spec>
```

This writes the last-pushed snapshot from the now-stamped files, so the next
`/spec-push` produces an empty plan. Commit the stamped spec + snapshot into the
branch so the mirror-link rides in the PR.

## 6. Report

Summarise what was created/updated in Linear (the spec issue and its
sub-issues), **say which transport was used**, and confirm the snapshot was
recorded. There is no pull — Linear is a generated mirror.

Saying the transport matters: on the API path you never saw the descriptions, so
"pushed 12 sub-issues" is the engine's report, not your observation. If it warned
that Linear stored different text, relay that — the repo is still correct, and a
re-push overwrites the mirror.

<!-- seam:spec-project-picker -->
