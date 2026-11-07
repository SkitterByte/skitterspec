---
name: spec-claim
description: Take ownership of a spec, hand it back, or give it to a teammate — the spec records who is building it and its Linear issue is assigned to them. Opt-in — needs specs/.core/linear.config.json with the repo owning assignee in sync.fieldOwnership. Use when the user says "/spec-claim", "claim this spec", "take ownership of this", "I'm picking this up", "hand this back", or "assign this spec to someone".
disable-model-invocation: true
---

# /spec-claim — take a spec, hand it back, or hand it over

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Ownership lives in the repo: the spec's frontmatter records who is building it,
and the push that follows tells Linear. This skill is how that record changes
after `/spec-start` has set it — a hand-off mid-flight, a spec picked up from
someone who moved on, or work a lead is distributing.

**Opt-in.** Needs `specs/.core/linear.config.json` *and* the repo to **own**
`assignee` in its `sync.fieldOwnership` — which `"none"` declines as surely as
omitting it does. If either is missing, say which one and stop: without the field
the stamp would sit in the file doing nothing.

**The engine refuses this too, and that is the point.** `spec-sync assign` checks
the same thing and writes nothing, so the rule holds for a script, a chained
command, and anyone who reached for the CLI directly. This paragraph was the only
thing enforcing it for long enough that the engine's own success line —
`next: push it, so Linear agrees` — was printed over a push that would drop the
field. Prose in one skill is not a guard; it is a guard's documentation.

## Under `pull`, the issue is the record

Ask once: `skitterspec spec-sync ownership --json`. Where `assignee` is
**`pull`**, Linear owns who is building the spec, and the repo keeps no copy — so
the steps below change in four places, and only these:

- **`assign` writes Linear directly and stamps nothing.** There is no repo record
  to change and no push to follow: §4 does not run, because the `assign` call
  *was* the write.
- **Take checks Linear, not the file.** Run `assign <spec> --to <id> --if-unassigned`
  first. If it reports the issue is already assigned to someone else, that is
  step 2's colleague: name them, confirm, then run it again without the flag.
- **No `> **Developer:**` line is written**, by any mode. The tracker names the
  person; a header would be the copy `pull` exists to remove.
- **§3 is skipped.** The issue's own history records the move, and a
  Changelog line saying who holds it would be that copy again.

Everything else stands: the opt-in check, resolving a person through a search
before a hand-over, and the report. Under `push` (or with ownership unknown)
nothing in this section applies.

## 1. Identify the target spec

The argument, else the spec in flight for this session, else ask. Unlike
`/spec-next` this does not refuse a spec you are not standing in: reassigning a
colleague's spec from your own checkout is a normal thing to want, and it writes
no code.

## 2. Work out the mode

| Invocation | Mode |
|------------|------|
| `/spec-claim [<spec>]` | **take** — you are building it |
| `/spec-claim [<spec>] --release` | **release** — nobody is |
| `/spec-claim [<spec>] --to <name-or-email>` | **hand over** — they are |

### take

1. `skitterspec spec-sync whoami --json`. If it answers, use that `id`/`name`.
   If it reports `transport = mcp`, call the user-read tool with `me` and cache
   the answer with `whoami --set <id> --name "<name>"`.
2. **If the spec already records someone else, confirm before taking it** —
   name them and say what will happen. Taking a colleague's spec by accident is
   the one mistake here worth a round trip; every other path is reversible with
   a second `/spec-claim`.
3. Stamp it: `skitterspec spec-sync assign <spec> --to <id> --name "<name>"`.
4. Set `> **Developer:**` to **`git config user.name`** — not the Linear display
   name. You are taking this spec yourself, so the header should name you the
   way `Author:`, the **State log** and your commits already do. The Linear name
   belongs to the *assignment*, which step 3 just recorded; the two answer
   different questions.

### release

`skitterspec spec-sync assign <spec> --release`. This removes the stamp and, on
the next push, unassigns the Linear issue.

**It does not clear `> **Developer:**`** — that header records who *actioned*
the work, which outlives who is currently holding it. If nobody will pick the
spec up, `/spec-cancel` is the honest move; releasing only says "not me, for
now".

### hand over (`--to`)

1. **Resolve the person through a search, never a typed id.** Run
   `skitterspec spec-sync users <name-or-email>` (or the user-list tool on MCP)
   and **confirm the match** before writing. This is the one path where the repo
   writes into somebody else's Linear inbox, so a mistyped id would assign a
   stranger and nothing downstream would notice.
2. On several matches, show them and let the user pick. On none, say so and
   stop — do not fall back to the raw argument as an id.
3. **Make the work reachable before you hand it over.** Run
   `skitterspec spec-env handoff <spec> --json`. A spec's branch lives in a
   local worktree, so without this the issue would name a new owner for code
   only you can see.
   - **`blocked`** — relay the reason. Where it carries an `offer` (uncommitted
     work: `/commit`), offer it once as `offered-unblocks.md` says, run it on a
     yes, then run `handoff` again. With no offer, stop here: nothing is assigned.
   - **`commands`** non-empty — the branch is not published at HEAD. Ask once,
     naming the target: *"push `<branch>` to `<remote>` so <name> can pick it
     up?"* Run it on a yes. On a no, stop: a hand-over the new owner cannot
     reach is not a hand-over, so nothing is assigned.
   - Then post the note it wrote onto the issue:
     `skitterspec spec-sync comment <spec> --file <notePath>`. It names the
     branch, the sha and the phases done, and a comment is the surface no later
     push replaces. A failed post is said and does not stop the hand-over.

   The new owner's `/spec-start <spec>` resumes from that branch rather than
   forking a fresh one (`spec-env up` sees it on the remote).
4. Stamp it with the resolved id and display name.
5. Set `> **Developer:**` to that person's **Linear display name**.

   This is the **one** place the tracker's name reaches the header, and the
   exception is the whole reason it exists: there is no `git config user.name`
   for somebody else's machine, so without it the header would go on crediting
   you for work you just gave away. Everywhere else — `/spec-start`, the
   `/spec-next` backfill, and taking a spec above — the git name wins, because
   there the person *is* you and the rest of the spec already names you that way.

## 3. Record it in the spec

Add a dated line to the **Changelog** in `00-overview.md` — who it moved to (or
from), and why if the user said. Ownership is a course-correction, not a
lifecycle transition, so it belongs there and **not** in the State log.

## 4. Push

Run `/spec-push`. The stamp is repo state, and the mirror catches up like any
other edit.

**If the push fails, the claim still stands.** Say so and stop: the repo is
correct, the mirror is disposable, and the next push repairs it. Do not roll the
stamp back — that would throw away the one durable half of the change.

## 5. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the spec records the new owner and Linear agrees.
- `⚠️` — the spec records it; Linear does not yet. The spec file is the record
  and the ticket is the mirror, so this is a lag rather than a conflict — say
  which way round it is.
- `⏸` — nothing to claim, or no provider configured.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` is who owns it now and whether Linear agrees yet — the whole answer,
in one row.
