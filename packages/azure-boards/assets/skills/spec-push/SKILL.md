---
name: spec-push
description: Push a spec up to its linked Azure Boards work item (repo → Boards, one-way). The repo is the source of truth and Boards a generated mirror, so content is never read back or merged. A spec is a work item and each phase a child item. Opt-in — needs specs/.core/azure-boards.config.json. Use when the user says "/spec-push", "push to Azure Boards", "update the work item from this spec".
---

# /spec-push — send a spec up to Azure Boards (one-way)

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Repo → Boards. The repo is the **source of truth**; Boards is a
**generated mirror**. A spec is a **work item**; each phase is a
**child work item**, and the phase file is mirrored into that child's
description as written — its prose, its sections, and its tasks as a read-only
markdown checklist, never as items of their own. Only the phase's h1 and
`> **Status:**` line are left out, because both are pushed as fields of their
own (the child's title and state). This skill computes what changed since the
last push and applies it — it never reads Boards content back or merges. A
person editing the mirror in Boards will see it overwritten on the next push.

**Opt-in**: only runs when `specs/.core/azure-boards.config.json` exists. If
absent, tell the user how to enable Azure Boards sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Pick the transport, and get the types' states

**Ask the engine first — it decides, not you:**

```
skitterspec spec-sync states --json
```

With a PAT set (`AZURE_DEVOPS_EXT_PAT`, or whatever `auth.tokenEnv` names, or
the credentials store) the engine talks to Azure DevOps directly. That is the
**fast path**, and it is the default whenever credentials resolve: descriptions
never pass through you, in either direction. Without them it falls back to MCP
and everything below works as it always has.

- **`transport = api`** → the command prints the configured types' state names
  as a JSON array (the union across `azure.workItemType` and `azure.childType`).
  Write it to a file and carry on to step 3.
  **Skip the MCP tool discovery entirely** — you make no Azure calls here.
- **`transport = mcp`** → do the MCP work: discover the work item
  **read + write** tools at runtime on Microsoft's official MCP server
  (remote `https://mcp.dev.azure.com/{org}`, or local `@azure-devops/mcp`) —
  `wit_work_item` to read, `wit_work_item_write` (create/update/add_child) to
  write. If Azure isn't connected or a needed tool is missing, relay the fix and
  stop, **writing nothing**. Then fetch the types' state **names** yourself and
  write them to a file as a JSON array (e.g. `["To Do","Doing","Done"]`).

Either way you end up with a states file. Step 3 requires it:
`push` **refuses to run** without one, because Azure refuses an unknown state
only **at write time** — after the description write has already landed — so a
configured name the process lacks would half-apply the push. It is checked
before anything is written. If the check reports a name that isn't in the
types, stop and fix `specs/.core/azure-boards.config.json`.

**If the check refuses, offer to fix it.** The refusal lists every configured
name the types lack, their real state names, and — where the bucket makes it
unambiguous — which one to use instead. Relay that, then offer to apply it to
`specs/.core/azure-boards.config.json` → `states`, and do so on the user's
confirmation. Never edit their config without asking, and never guess a bucket
the refusal made no suggestion for — ask which state they want.

`--skip-state-check` exists for the deliberate exception; do not reach for it to
get past a failing check.

## 3. Get the plan from the engine

```
skitterspec spec-sync plan <spec> --workspace-states <file> --json
```

The engine prints a JSON **plan** (no network, no remote read):

```json
{
  "issue": { "description": "…", "state": "in-progress" },
  "subIssues": {
    "create": [{ "ref": "01-outbox", "name": "Outbox", "goal": "…", "state": "backlog" }],
    "update": [{ "id": "AB#2", "name": "…", "goal": "…", "state": "in-progress" }]
  }
}
```

An empty plan (no `issue`, no child create/update) means the mirror is up to
date — say so and stop. The plan's `subIssues` key is where the children live.
`state` values are local buckets
(`backlog`/`in-progress`/`complete`/`cancelled`); map each to the Boards STATE
name via `config.states` at apply time.

A **`phasesDeferred`** field means `mapping.phases` is `"deferred"` and this spec
has not started, so its phases are deliberately absent from the plan — the item
pushes alone and the children are minted by the push that follows `/spec-start`.
Relay the count; it is not a sign the phase files failed to parse. Nothing else
about applying the plan changes.

The plan always carries a **`phaseMode`** field — `subissue`, `deferred` or
`inline` — the mode that resolved for THIS spec's lifecycle bucket.
`mapping.phases` may be a per-bucket map, so the config alone no longer tells you
which mode a given spec got. Relay it whenever it is not `subissue`:

- **`inline`** — no children are created at all. Each unlinked phase is a
  section of the spec item's own description, and the `## Phases` index stays as
  its table of contents. A plan with no child creates is the expected shape,
  not a parse failure. A phase that already carries an id keeps its child and
  still appears under `subIssues` — apply those normally.
- **`deferred`** — as above; the `phasesDeferred` count says how many are waiting.

Nothing about how you apply the plan changes in either mode: apply exactly the
`issue` and `subIssues` the plan lists.

## 4. Apply the plan

**On `transport = api`, this is one command:**

```
skitterspec spec-sync apply <spec> --plan plan.json
```

It creates and updates the work item and its children, reads each description
back and runs the same check as step 4b, stamps every returned id into the spec,
and records the snapshot. **Steps 4a–5 below are then already done** — skip to
step 6 and report what it printed, including the transport.

Two things it guarantees, so you don't have to manage them:

- **It writes nothing until everything checkable has been checked** — a missing
  id or a `config.states` name the types lack fails before the first write.
- **It stamps each id the moment its object exists.** If a run is interrupted,
  re-run the same command: the objects it already created are linked, so the new
  plan sees them as updates and no duplicate is minted. Never "start again" by
  hand.

There is no project to pick, on either path: a minted item lands in the
configured `azure.project` by construction.

## 4a. Apply it yourself — the MCP path (order matters)

**First, check whether you are about to overwrite someone.** On the API path
`apply` does this for itself, off the read-back it already makes. On the MCP
path nothing has read the item yet, so ask before you write:

```
skitterspec spec-sync status <spec> --remote <itemfile>
```

using the same work item JSON step 2 fetched — it must carry the
`System.Description` field. A `drift: … description was edited on Azure Boards
since the last push` line means a person wrote something there that step 1
below replaces.

**It is a warning and never a gate.** The repo is the source of truth and the
push still goes ahead; relay the line, name the item, and carry on. What is
forbidden is doing it *silently* — someone's paragraph disappearing with nothing
said about it is the failure this exists to end. Nothing printed means nothing to
say, which includes every case the engine could not tell.

1. **Spec item** → if the overview has no `azure_identifier`, this push
   **mints** it: create it with the write tool (`action: create`; work item type
   = `azure.workItemType`; title from the spec title; description from
   `plan.issue.description`, **as markdown** — set the markdown format where
   the tool offers it), then set its state to the one `config.states` maps
   `plan.issue.state` to. Keep the returned id and url for step 5 — don't
   hand-edit frontmatter. If it already exists and `plan.issue` is present,
   **update it by id**, and set the state only when it actually differs.
2. **Children create** → for each, create with `action: add_child` under the
   spec item's id, type = `azure.childType` (`name` → title, `goal` →
   description), then set the mapped state. Keep each returned id against its
   `ref` (the phase-file basename).
3. **Children update** → update by id (title/description), plus a state write
   where the state changed.

Priority, iterations, area moves and comments are Boards-native triage — do
**not** push them; they're the PM's.

## 4b. Verify what Boards actually stored — the MCP path

*(On the API path `apply` already did this. Skip.)*

Boards stores a markdown-format description **verbatim**, so the read-back is
normally the pushed text byte for byte — and an item that predates the markdown
format reads back as HTML, which the engine reduces to text before comparing.
Either way the comparison is **words rather than bytes**. Check before you
record the push as good.

For each item you created or updated in step 4a, read its description back and
write what you got to a JSON file:

```json
{ "issue": "<stored description>", "subIssues": { "01-outbox": "<stored>" } }
```

Then:

```
skitterspec spec-sync verify <spec> --stored <file>
```

It compares against what the engine sent, ignoring the formatting that
legitimately does not survive the round-trip and reporting only lost or altered
**word characters**. Relay any divergence — it prints both sides around the
first difference. It exits 0 either way: the repo is unaffected and still
correct, so this is a warning, not a failure.

This is **not a pull**. Nothing read here is merged, stamped, or written
anywhere; the repo remains the only source of truth. Do it before step 5 so a
corrupted push is visible before the snapshot records it as good.

## 5. Stamp the ids, then record the snapshot — the MCP path

*(On the API path `apply` already did both. Skip.)*

Write every id you collected back into the spec in **one** call — the engine
does the file edits, so there is no hand-editing of frontmatter:

```
skitterspec spec-sync stamp <spec> \
  --issue AB#11 --url https://dev.azure.com/<org>/<project>/_workitems/edit/11 \
  --sub 01-outbox=AB#12 --sub 02-api=AB#13
```

Pass `--issue`/`--url` only on the push that minted the spec item; pass one
`--sub <ref>=<id>` for every child **created** in step 4a.2 (updates already
have their id). Bare numbers are accepted and normalised to `AB#n`. It validates
every ref and id **before** writing anything and exits non-zero having changed
nothing if any is wrong — so a typo can't leave the spec half-stamped, pointing
at an item that isn't there. Fix what it reports and re-run; it is safe to
repeat.

Then record what was pushed:

```
skitterspec spec-sync record <spec>
```

This writes the last-pushed snapshot from the now-stamped files, so the next
`/spec-push` produces an empty plan. Commit the stamped spec + snapshot into the
branch so the mirror-link rides in the PR.

## 5b. A refused mint, and the way back

Two refusals reach you from `apply`, and neither is a failure to retry.

**`N already exists and no spec claims it`** — the push was about to mint, and
an item with **exactly** this title is sitting there unheld. That is almost
always the spec's own item, whose link was lost: a bad merge, a hand edit, a
stray `sed` over the frontmatter. Adopt it rather than creating a twin. The
Linear provider ships `reattach` for this; the Azure Boards provider does not
yet, so the fix is the manual escape hatch — read the item id back to the user,
confirm it is the spec's own item, then:

```
skitterspec spec-sync stamp <spec> --issue AB#<n>
```

**`N exists in Boards but could not be recorded`** — the create landed and the
stamp did not, so Boards holds an item the repo does not point at.
**Do not re-run**:
the plan still reads the spec as unlinked, so a re-run mints a second.
`stamp` with the id the refusal named is the fix here too.

Everything else — a rate limit, a refusal that says waiting will not help — is
reported with Azure's own explanation and whether retrying can help. Relay it;
do not paraphrase.

## 6. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the mirror matches the repo and the snapshot is recorded.
- `⚠️` — pushed, with something worth knowing: Boards stored different words,
  or `phasesDeferred` phases not yet minted.
- `❌` — it wrote some objects and failed on another. Name what exists in Boards
  now; `apply` stamps each id as it goes, so the re-run is an update, never a
  duplicate.
- `⏸` — no config, no `azure_identifier`, or an unvalidated state list. Nothing
  was written.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` carries what was created and updated — the spec item and its
children — **the transport that did it**, and that the snapshot was recorded.

**Say the transport, every time.** On the API path you never saw the
descriptions, so "pushed 12 children" is the engine's report rather than your
observation, and that distinction is the difference between a fact and a
paraphrase. If it warned that Boards stored different words, relay it: the repo
is still correct and a re-push overwrites the mirror.

There is no pull — Boards is a generated mirror.

<!-- seam:spec-project-picker -->
