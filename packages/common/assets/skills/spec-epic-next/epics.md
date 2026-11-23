# Epics

An **epic** is a spec of specs: `epic-<name>/00-overview.md` and
**no phase files**. It records why a group belongs together and, optionally,
`> **Lanes:** N`, how many members may be in flight at once. `/spec` proposes
one when the grill describes several specs and their order.

**The order lives on the members, never on the epic.** Each member carries
`> **Epic:** epic-<name>` and `> **Waits on:**`, and any phase file may carry its
own `Waits on:`. `skitterspec epic status <epic>` turns those headers into what
can start now, what is blocked and on what, the waves, the phase-level sync
points, and pairs whose `Area:` overlaps (never run together). A wait is met
only on the base branch: the spec in `complete/`, or that phase file marked
done. Anything the engine cannot see counts as cannot-tell, never as met.

**Checked where the work happens.** `/spec-start` and `/spec-next` on a member
ask `skitterspec epic check` before building. An unmet wait warns and offers a
recorded bypass (`.claude/rules/offered-unblocks.md`). It never refuses, and a
build never passes a wait silently. An epic gets a documents-only worktree,
`/spec-next` refuses it, and `/spec-complete` refuses while a member is still
open, offering to complete with those members listed.

## Migrating an `issue-` plan spec to an epic

Move the plan's order onto its members:

1. `git mv` the folder to `epic-<name>` and set `> **Type:** Epic`.
2. Add `> **Epic:**` and `> **Waits on:**` to each member, plus a phase file's
   own `Waits on:` for a phase-level sync point.
3. Delete the wave phase files; `epic status` derives them.
4. Keep the plan's Decisions. They hold the reasons the headers cannot.

**A phase that is not a wave becomes a member**, usually an **Issue** (manual
steps, no code), with `> **Epic:**` and its own `> **Waits on:**`. Anything that
waited on that phase now waits on the member.

**Do it off the base branch** on a `/no-spec` branch. Before landing, run
`skitterspec epic status <epic> --here` from that worktree. It reads the
branch's members and headers, uncommitted edits included, while still counting
a wait as met only on the base branch.

**The epic's first push retires the wave sub-issues.** Each phase sub-issue
still in the snapshot is closed as not planned and unlinked. A tracker that
cannot retire one names it, so it can be closed by hand.
