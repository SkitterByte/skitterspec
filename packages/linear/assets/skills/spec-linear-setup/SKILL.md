---
name: spec-linear-setup
description: Configure Linear sync for this repo by interview rather than by hand. Discovers the workspace over MCP (teams, projects, labels, issue workflow states), asks how the work is organised — which team this repo files into, whether products are split by team or by project, which labels drive intake — then hands the answers to `skitterspec spec-sync init-config`, which validates them and writes specs/.core/linear.config.json. Checks the configured workflow-state names against the workspace, so a renamed state is caught now instead of silently producing a mirror that never moves. Safe to re-run: an existing config is reviewed, never overwritten without consent. Use when the user says "/spec-linear-setup", "set up Linear sync", "connect this repo to Linear", "configure linear.config.json", or "check my Linear setup".
---

# /spec-linear-setup — configure Linear sync by interview

Writes `specs/.core/linear.config.json`, the file that switches one-way Linear
sync on for this repo. You **discover and interview**; the engine
(`spec-sync init-config`) **validates and writes**. Keep that split: composing the
JSON yourself is how a malformed config gets committed, and the engine already
rejects everything the loader would later reject.

The gap this closes is not "I can't find my team's UUID" — it's that nothing ever
asks how the workspace is *organised*, so the config ends up describing a shape
nobody confirmed. Ask about structure first; the ids fall out of the answers.

**Prerequisite:** the Linear MCP server connected and authenticated (`SETUP.md`
step 2). Without it, see step 1's degrade rule — never half-write a config.

## 1. Check what already exists

Read `specs/.core/linear.config.json`.

- **Absent** — this is a first-time setup. Carry on.
- **Present** — say so and default to **reviewing** it, not replacing it: run the
  discovery in step 2 and report where the live config disagrees with the
  workspace (a team that no longer exists, a state name that was renamed, an
  intake label that's gone). That is the most useful thing a re-run can do. Only
  write when the user asks for it, and then pass `--force`.

Then confirm MCP is reachable by making the first discovery call in step 2.
**Degrade, never block:** if Linear isn't connected or the tools are missing, say
so in one line — *"Linear MCP not connected — can't discover the workspace"* —
point at the manual path in `SETUP.md` ("Scaffold the config"), and
**stop without writing anything**. A half-written config is worse than none:
every other command switches on the moment the file exists.

## 2. Discover the workspace

Discover the Linear MCP read tools at runtime and call them before asking
anything. The interview offers real lists; it never prompts for a raw id.

| Tool | What you need from it |
|------|----------------------|
| `list_teams` | every team's name, **key** (e.g. `SKI`) and **id** (UUID) |
| `list_projects` | the projects, per candidate team — names + ids, minus archived/completed |
| `list_issue_statuses` | the team's **issue workflow-state names**, exactly as spelled |
| `list_issue_labels` | the label names available for intake routing |

Projects, labels and statuses are all **team-scoped** — fetch them for the team
once step 3 has settled it, not for the whole workspace up front.

## 3. Which team does this repo file into?

**This config pins exactly one team for the whole repo.** Say that plainly
whenever there is more than one, because it reframes the question: it isn't
"which team do you like", it's *"which product's work does this repo hold"*.

- **One team** — confirm it and move on; there is nothing to decide.
- **Several teams** — list them (name + key), and ask which one this repo's specs
  belong to. **Recommend** the team whose key or name matches the repo, and say
  why. If the user has one repo per product and a team per product, that mapping
  is the answer.
- **The repo genuinely spans two teams** — sync can't express that today. Say so,
  and offer the two honest options: pick the team that owns most of the work, or
  split the repo's specs across two checkouts. Don't invent a workaround.

## 4. How is the work split — by team, or by project?

The question the old setup never asked. Both shapes are normal in Linear:

- **Team per product** — each product gets its own team, its own issue prefix and
  its own cycles. Usual when the products have different people or cadences.
  Then `teamId` *is* the product, and `projectId` stays empty: every spec files
  straight into the team.
- **Project per product, inside one team** — one team, each product a project.
  Usual when the same people work across products. Then `teamId` is that one
  team, and `projectId` is the **default** project the picker pre-selects.
- **Neither — projects are per-milestone/quarter** — leave `projectId` empty and
  let the picker ask each time.

Ask which shape this workspace uses, offering the discovered project list as
evidence. **Recommend** based on what you actually see: several teams whose names
read as products ⇒ team-per-product; one team with product-shaped projects ⇒
project-per-product.

Then set the default: offer the team's live projects plus an explicit
**None (team only)**, and say what the choice means — `projectId` is the picker's
*pre-selection*, not a mandate. `/spec` still offers the full list on every spec,
and a PM re-homing an issue in Linear is never overwritten.

> **Initiatives are not used for placement.** A spec issue attaches to a team and
> optionally a project; if this workspace groups projects under initiatives, pick
> the project inside the initiative and the grouping keeps working in Linear.

## 5. Which labels drive intake? (optional)

Only relevant if the user wants to *start* specs from Linear issues
(`/spec <ISSUE-REF>`, `/spec --from-issue`). Ask, offering the discovered labels;
"none" is a fine answer and leaves intake off entirely — a bare issue ref still
works.

- **`intake.label`** — the inbox `/spec --from-issue` browses.
- **`bugLabels`** — issues carrying one of these route to `/spec-bug`.
- **`hotfixLabels`** — route to `/spec-hotfix` instead: a bug that must be patched
  on the *released* version. Takes precedence over `bugLabels` on an issue
  carrying both.

Recommend the obvious matches from the label list (a `bug` label for `bugLabels`,
a `production`/`hotfix` label for `hotfixLabels`) rather than asking cold.

## 6. Check the workflow-state names

Write the `list_issue_statuses` names to a temp file as a JSON array, exactly as
Linear spells them:

```json
["Backlog", "Todo", "In Progress", "Done", "Canceled"]
```

Pass it as `--states`. This is the check worth having:
**Linear silently ignores an unknown issue state**, so a workspace that renamed
`Done` would push clean and produce a mirror that never moves. Catching it here
— while the user is still in the setup conversation — is the whole reason the
engine validates rather than just writes.

If the engine refuses, it names each bad state *and the flag that fixes it*:

```
states.complete: "Done" is not an issue state in this workspace
  pass --state complete="Shipped"
```

Relay that, confirm the mapping with the user (the suggestion is a suggestion —
never apply one they didn't agree to), and re-run with the `--state` flags. If it
made no suggestion for a bucket, **ask** which state means "finished" here rather
than guessing.

## 7. Write it

```
skitterspec spec-sync init-config \
  --team-id <uuid> [--team-key KEY] [--project-id <uuid>] \
  [--intake-label <name>] [--bug-labels a,b] [--hotfix-labels a,b] \
  [--state <bucket>=<name> …] \
  --states <statesfile> [--force] [--json]
```

The engine writes **only the keys that differ from the defaults**, so the file
shows this repo's choices and keeps inheriting everything else. `--force` is
required to replace an existing config — never pass it without the user having
asked for a rewrite in step 1.

**Relay the engine's report as printed.** It names the team, the project (or
"team only"), the intake labels, and how many state names were checked against
the workspace — that report is the evidence the setup is right, so don't
paraphrase it into "done".

## 8. Report and hand off

Confirm the file written and what it says, then name the next step:

- `/spec` — write a spec; with Linear configured it offers the project picker,
  creates the linked issue and stamps the id.
- `/spec-status` — read-only drift report, the safe way to prove the link works.
- `/spec-push` — send a spec up.

Mention what setup did **not** configure, so the defaults aren't mistaken for
decisions: phase mapping (`mapping.phases` — sub-issue per phase by default),
field ownership, and the API key (`LINEAR_API_KEY`, which makes pushes take the
fast path and never lives in the config). Point at `linear.config.md` for those.
