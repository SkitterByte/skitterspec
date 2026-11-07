---
name: spec-incident
description: Capture a live incident — an outage or degradation of a running service — as an Incident-type spec written during the outage. Grills for what is down, since when, who is affected, severity and what was tried, then writes the spec straight into specs/in-progress/ with a Timeline appended to as it unfolds. Fixes are separate linked specs, never phases. Use when the user says "/spec-incident", "we have an outage", "prod is down and I need an incident record", or asks to track an incident.
---

# /spec-incident — capture a live incident

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

An **incident** is an outage or degradation of a live service. It is not
delivery work: the fixes are separate hotfix, bug, chore or issue specs, each
linked back to it, and this spec is the **record** — what happened, when, to
whom, and what was done. It is written **during** the outage, so it starts in
`specs/in-progress/`, there is no backlog stop and no review page to wait on:
speed matters, and the record is reviewed at completion, when
`/spec-complete` writes the incident log from it.

**This skill is not the response.** Mitigating comes first, and nothing here
blocks it — the grill is short, the spec is small, and everything else is
appended as it happens.

## 1. Grill — short, and only what the record needs

Ask for exactly these, batched, with nothing speculative:

1. **What is down or degraded** — the service, and how it is failing.
2. **Since when** — first report, and detection time where they differ.
3. **Who is affected** — which users or systems, and how badly.
4. **Severity** — Azure's literal values: `1 - Critical`, `2 - High`,
   `3 - Medium`, `4 - Low`. Propose one from the impact described; the user
   confirms.
5. **What has been tried** — anything already attempted, and its effect.

A root cause is **not** grilled: nobody has it yet, and the Timeline is where
the investigation lands as it happens.

### No live outage to record — route to the right door

This is the costliest door to enter wrongly — no backlog stop, no review page,
straight into `specs/in-progress/` — so the grill's own answers are also its
exit. When items 1 and 2 establish there is **no outage to record** — nothing
is down or degraded, it never was live, or it is a risk rather than an event —
propose the right door instead of writing an incident
(`.claude/rules/spec-planning.md` carries the full routing matrix):

- a **defect** → **`/spec-bug`**, or **`/spec-hotfix`** when it is on a
  released version;
- anything else → **`/spec`**, whose kind proposal picks feature, chore or
  issue from there.

**A past outage someone wants a record of stays an incident**: "it is over" is
not "it never happened" — the signal is *no outage to record*, not *no outage
now*. This check is the grill's existing questions read honestly, never an
extra round trip, and the hand-off contract is the same as everywhere else:
confirm first, naming the signal in the user's own words; a decline carries
this skill on; on a confirmed switch invoke the destination skill in-session,
seeded with everything already established.

## 2. Write it, in flight

Pick a short kebab name prefixed `incident-` (e.g. `incident-api-outage`).

**With per-spec isolation** (`specs/.core/env.config.json` present), provision
before writing, exactly as `/spec` Phase B does: run
`skitterspec spec-env up <name> --docs`, run the commands it prints, `cd` into
the worktree, and confirm with a bare `skitterspec spec-env resolve` naming
this spec. Without isolation, write where you stand.

The spec is a folder in **`specs/in-progress/`** — never backlog — with
`00-overview.md` and one phase file:

<!-- seam:spec-status-owner -->

```markdown
# Incident: <short title>

> **Type:** Incident
> **Name:** incident-<kebab-name>
> **Status:** In Progress — live (started <YYYY-MM-DD>)
> **Author:** <git user.name>
> **Developer:** <git user.name — whoever is running the incident>
> **Raised:** <YYYY-MM-DD (today)>
> **Severity:** <1 - Critical … 4 - Low>
> **Gating:** <pre-filled "none: incident record, no code"; only when release
> gating is configured, omit otherwise>

## Impact

<who is affected, what is failing, since when — from the grill>

## Timeline

- <YYYY-MM-DD HH:MM> — <first report / detected / what was tried / what changed>

## Fixes

<one line per fix spec as they are opened — see step 4. "None yet" until then.>

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | In Progress | in-progress | <author> |

## Changelog

- <YYYY-MM-DD> — Incident captured.
```

The phase file `01-response.md` holds the response as tasks — mitigate,
diagnose, open fix specs, verify recovery — manual steps, not code. Commits in
this spec default to `docs` with no `Release-Note:`.

## 3. Link to the tracker (only if a provider is installed)

Run the provider's linking push exactly as `/spec` Phase E describes — the
spec is already in `in-progress`, so the mint lands in the incident's
in-flight state (with Azure's `statesByType`, an Incident is created Active
and never sent New; the `Severity:` header is written where the provider has a
home for it). No provider, or an unreachable tracker, is one line and the
record stands in the repo.

## 4. Run the incident from the spec

- **Append to the Timeline** as things happen — dated lines, cheap and often.
- **Fixes are separate specs**: a prod-version fix is `/spec-hotfix`, a
  mainline defect `/spec-bug`, tooling `/spec` (chore), manual remediation
  `/spec` (issue). Each fix spec carries `> **Incident:** incident-<name>` in
  its header, which the next push turns into a related link on the tracker.
  They are never phases of this spec.
- **Mid-incident board states stay manual**: skitterspec writes states at
  lifecycle moves only, so moving the ticket to a Mitigated-style state during
  the outage is done on the board, and the next push leaves it until the spec
  itself moves.

## 5. End of the outage is not the end of the spec

When the service is recovered, say so in the Timeline and keep the spec in
flight until the record is complete — root cause written, fixes linked.
`/spec-complete` is the ending: it writes `incident-log.md` from this spec and
its linked fixes, refuses while a linked fix is still open (and offers to
complete anyway with it listed as outstanding), and pushes the log onto the
incident item as a comment.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file
carries the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the incident spec is written, in flight, and (where a provider is
  installed) linked.
- `⚠️` — written and in flight, with something worth knowing (a mint that
  failed, a worktree that could not be provisioned so it was written in
  place).
- `⏸` — the grill could not establish what is down, so nothing was written.

**Fields:** `Tracker` · `Branch` · `Spec` · `Built` · `Worktree` ·
`Follow-ups` · `Next`

`Next` is the response itself — the first task of `01-response.md` — never a
review page: nothing here waits on a verdict while a service is down.
