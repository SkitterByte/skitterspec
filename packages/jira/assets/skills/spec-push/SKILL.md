---
name: spec-push
description: Push a spec up to its linked Jira issue (repo → Jira, one-way). The repo is the source of truth and Jira a generated mirror, so content is never read back or merged. A spec is an issue and each phase a subtask. Opt-in — needs specs/.core/jira.config.json. Use when the user says "/spec-push", "push to Jira", "update the Jira issue from this spec".
---

# /spec-push — send a spec up to Jira (one-way)

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Repo → Jira. The repo is the **source of truth**; Jira is a
**generated mirror**. A spec is a Jira **issue**; each phase is a **subtask**,
and the phase file is mirrored into that subtask's description as written — its
prose, its sections, and its tasks as a read-only checklist, never as issues of
their own. Only the phase's h1 and `> **Status:**` line are left out, because
both are pushed as fields of their own (the subtask's summary and status). This
skill computes what changed since the last push and applies it — it never reads
Jira content back or merges. A person editing the mirror in Jira will see it
overwritten on the next push.

**Opt-in**: only runs when `specs/.core/jira.config.json` exists. If absent,
tell the user how to enable Jira sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Pick the transport, and get the project's statuses

**Ask the engine first — it decides, not you:**

```
skitterspec spec-sync states --json
```

With Jira credentials set (`JIRA_EMAIL` + `JIRA_API_TOKEN`, or whatever
`auth.emailEnv`/`auth.tokenEnv` name) the engine talks to Jira Cloud directly.
That is the **fast path**, and it is the default whenever credentials resolve:
descriptions never pass through you, in either direction. Without them it falls
back to MCP and everything below works as it always has.

- **`transport = api`** → the command prints the project's status names as a
  JSON array. Write it to a file and carry on to step 3.
  **Skip the MCP tool discovery entirely** — you make no Jira calls here.
- **`transport = mcp`** → do the MCP work: discover the issue
  **read + create/update** tools at runtime on Atlassian's official remote MCP
  server (mcp.atlassian.com) — `getJiraIssue`, `createJiraIssue`,
  `editJiraIssue`, plus `transitionJiraIssue` for status moves. If Jira isn't
  connected or a needed tool is missing, relay the fix and stop,
  **writing nothing**. Then fetch the project's status **names** yourself and
  write them to a file as a JSON array
  (e.g. `["To Do","In Progress","Done"]`).

Either way you end up with a states file. Step 3 requires it:
`push` **refuses to run** without one, because a Jira status is reached by
**workflow transition** — the engine resolves the transition to the mapped
status and refuses loudly when none reaches it, and it never path-finds through
intermediate statuses. A configured name the project lacks would therefore fail
mid-apply, after the description already landed, so it is checked before
anything is written. If the check reports a name that isn't in the project,
stop and fix `specs/.core/jira.config.json`.

**If the check refuses, offer to fix it.** The refusal lists every configured
name the project lacks, the project's real status names, and — where the bucket
makes it unambiguous — which one to use instead. Relay that, then offer to
apply it to `specs/.core/jira.config.json` → `states`, and do so on the user's
confirmation. Never edit their config without asking, and never guess a bucket
the refusal made no suggestion for — ask which status they want.

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
    "update": [{ "id": "PROJ-2", "name": "…", "goal": "…", "state": "in-progress" }]
  }
}
```

An empty plan (no `issue`, no subtask create/update) means the mirror is up to
date — say so and stop. The plan's `subIssues` key is where the subtasks live.
`state` values are local buckets
(`backlog`/`in-progress`/`complete`/`cancelled`); map each to the Jira STATUS
name via `config.states` at apply time.

A **`phasesDeferred`** field means `mapping.phases` is `"deferred"` and this spec
has not started, so its phases are deliberately absent from the plan — the issue
pushes alone and the subtasks are minted by the push that follows `/spec-start`.
Relay the count; it is not a sign the phase files failed to parse. Nothing else
about applying the plan changes.

The plan always carries a **`phaseMode`** field — `subissue`, `deferred` or
`inline` — the mode that resolved for THIS spec's lifecycle bucket.
`mapping.phases` may be a per-bucket map, so the config alone no longer tells you
which mode a given spec got. Relay it whenever it is not `subissue`:

- **`inline`** — no subtasks are created at all. Each unlinked phase is a
  section of the spec issue's own description, and the `## Phases` index stays as
  its table of contents. A plan with no subtask creates is the expected shape,
  not a parse failure. A phase that already carries an id keeps its subtask and
  still appears under `subIssues` — apply those normally.
- **`deferred`** — as above; the `phasesDeferred` count says how many are waiting.

Nothing about how you apply the plan changes in either mode: apply exactly the
`issue` and `subIssues` the plan lists.

## 4. Apply the plan

**On `transport = api`, this is one command:**

```
skitterspec spec-sync apply <spec> --plan plan.json
```

It creates and updates the issue and its subtasks, reads each description back
and runs the same check as step 4b, stamps every returned key into the spec, and
records the snapshot. **Steps 4a–5 below are then already done** — skip to step 6
and report what it printed, including the transport.

Two things it guarantees, so you don't have to manage them:

- **It writes nothing until everything checkable has been checked** — a missing
  key or a `config.states` name the project lacks fails before the first write.
- **It stamps each key the moment its object exists.** If a run is interrupted,
  re-run the same command: the objects it already created are linked, so the new
  plan sees them as updates and no duplicate is minted. Never "start again" by
  hand.

If it prints **`transport = mcp`** it has written nothing and is telling you to
apply the plan yourself — do steps 4a, 4b and 5 below. Pass `--via mcp` to force
that deliberately.

There is no project to pick, on either path: a minted issue lands in the
configured `jira.projectKey` by construction.

## 4a. Apply it yourself — the MCP path (order matters)

**First, check whether you are about to overwrite someone.** On the API path
`apply` does this for itself, off the read-back it already makes. On the MCP
path nothing has read the issue yet, so ask before you write:

```
skitterspec spec-sync status <spec> --remote <issuefile>
```

using the same issue JSON step 2 fetched — it must carry the `description`. A
`drift: … description was edited on Jira since the last push` line means a
person wrote something there that step 1 below replaces.

**It is a warning and never a gate.** The repo is the source of truth and the
push still goes ahead; relay the line, name the issue, and carry on. What is
forbidden is doing it *silently* — someone's paragraph disappearing with nothing
said about it is the failure this exists to end. Nothing printed means nothing to
say, which includes every case the engine could not tell.

1. **Spec issue** → if the overview has no `jira_identifier`, this push
   **mints** it: create it with `createJiraIssue` (`project` = `jira.projectKey`;
   issue type = `jira.issueType`; summary from the spec title; description from
   `plan.issue.description`), then move it with `transitionJiraIssue` to the
   status `config.states` maps `plan.issue.state` to. Keep the returned key and
   url for step 5 — don't hand-edit frontmatter. If it already exists and
   `plan.issue` is present, **update it by key** with `editJiraIssue`, and
   transition only when the status actually differs.
2. **Subtasks create** → for each, `createJiraIssue` with `parent` = the spec
   issue key and issue type = `jira.subtaskType` (`name` → summary, `goal` →
   description), then transition to the mapped status. Keep each returned key
   against its `ref` (the phase-file basename).
3. **Subtasks update** → `editJiraIssue` by key (summary/description), plus
   `transitionJiraIssue` where the status changed.

Priority, labels, sprints and comments are Jira-native triage — do **not** push
them; they're the PM's.

## 4b. Verify what Jira actually stored — the MCP path

*(On the API path `apply` already did this. Skip.)*

Jira stores descriptions as **ADF** (Atlassian Document Format), not markdown:
the adapter renders markdown to ADF on push and reduces what Jira holds back to
text on read-back, so the comparison is **words rather than bytes**. Check
before you record the push as good.

For each issue you created or updated in step 4a, read its `description` back
(`getJiraIssue`) and write what you got to a JSON file:

```json
{ "issue": "<stored description>", "subIssues": { "01-outbox": "<stored>" } }
```

Then:

```
skitterspec spec-sync verify <spec> --stored <file>
```

It compares against what the engine sent, ignoring the formatting that
legitimately does not survive the ADF round-trip and reporting only lost or
altered **word characters**. Relay any divergence — it prints both sides around
the first difference. It exits 0 either way: the repo is unaffected and still
correct, so this is a warning, not a failure.

This is **not a pull**. Nothing read here is merged, stamped, or written
anywhere; the repo remains the only source of truth. Do it before step 5 so a
corrupted push is visible before the snapshot records it as good.

## 5. Stamp the keys, then record the snapshot — the MCP path

*(On the API path `apply` already did both. Skip.)*

Write every key you collected back into the spec in **one** call — the engine
does the file edits, so there is no hand-editing of frontmatter:

```
skitterspec spec-sync stamp <spec> \
  --issue PROJ-11 --url https://your-site.atlassian.net/browse/PROJ-11 \
  --sub 01-outbox=PROJ-12 --sub 02-api=PROJ-13
```

Pass `--issue`/`--url` only on the push that minted the spec issue; pass one
`--sub <ref>=<key>` for every subtask **created** in step 4a.2 (updates already
have their key). It validates every ref and key **before** writing anything and
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

## 5b. A refused mint, and the way back

Two refusals reach you from `apply`, and neither is a failure to retry.

**`N already exists and no spec claims it`** — the push was about to mint, and
an issue with **exactly** this title is sitting there unheld. That is almost
always the spec's own issue, whose link was lost: a bad merge, a hand edit, a
stray `sed` over the frontmatter. Adopt it rather than creating a twin. The
Linear provider ships `reattach` for this; the Jira provider does not yet, so
the fix is the manual escape hatch — read the issue key back to the user,
confirm it is the spec's own issue, then:

```
skitterspec spec-sync stamp <spec> --issue <PROJ-N>
```

**`N exists in Jira but could not be recorded`** — the create landed and the
stamp did not, so Jira holds an issue the repo does not point at.
**Do not re-run**:
the plan still reads the spec as unlinked, so a re-run mints a second.
`stamp` with the key the refusal named is the fix here too.

Everything else — a rate limit, a refusal that says waiting will not help — is
reported with Jira's own explanation and whether retrying can help. Relay it;
do not paraphrase.

## 6. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the mirror matches the repo and the snapshot is recorded.
- `⚠️` — pushed, with something worth knowing: Jira stored different words, or
  `phasesDeferred` phases not yet minted.
- `❌` — it wrote some objects and failed on another. Name what exists in Jira
  now; `apply` stamps each key as it goes, so the re-run is an update, never a
  duplicate.
- `⏸` — no config, no `jira_identifier`, or an unvalidated status list. Nothing
  was written.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` carries what was created and updated — the spec issue and its
subtasks — **the transport that did it**, and that the snapshot was recorded.

**Say the transport, every time.** On the API path you never saw the
descriptions, so "pushed 12 subtasks" is the engine's report rather than your
observation, and that distinction is the difference between a fact and a
paraphrase. If it warned that Jira stored different words, relay it: the repo
is still correct and a re-push overwrites the mirror.

There is no pull — Jira is a generated mirror.

<!-- seam:spec-project-picker -->
