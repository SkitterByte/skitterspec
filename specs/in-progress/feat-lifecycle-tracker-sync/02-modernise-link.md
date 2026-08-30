# Phase 2 — Modernise the link fragment to `apply` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** linking a spec takes the same fast path `/spec-push` does, so `/spec`
stops creating issues by hand — and the fragment is correct before phase 3
reuses it in two more skills.

## Tasks

- [x] Rewrite `seams/spec-tracker-link.md` to link via the engine: ask
      `spec-sync states` for the transport, get the plan, then one
      `spec-sync apply` — mirroring what `/spec-push` step 4 now does.
- [x] Keep the project picker as the interactive step it has to be, passing the
      result through as `--project <id>`.
- [x] Keep the MCP path documented as the fallback for anyone without a key, the
      same way `/spec-push` does — this is not a deprecation.
- [x] Drop the hand-stamping instructions the engine now does itself, and check
      no step still tells the agent to edit frontmatter directly.
- [x] Re-check `seams/spec-project-picker.md` for the same drift and update it if
      it assumes the MCP-only flow. It did, in both directions — see Notes.
- [x] Add `spec-sync projects [--json]`, so the picker has a list to offer on the
      API path (not in the plan; the picker cannot work without it).
- [x] Add tests: the link fragment names `spec-sync apply` and no longer tells the
      agent to create the issue itself; it still names the picker; the MCP
      fallback survives. Run the project's typecheck and test commands — green
      before the phase is done.

## Notes

This is a pre-existing drift, not new breakage: `spec-tracker-link` was written
before the API path existed and was missed when `/spec-push` was rewritten. It is
sequenced before phase 3 so the fix is not copied into `/spec-bug` and
`/spec-hotfix` along with the fragment.

**Addition to the plan: `spec-sync projects`.** The picker had the same drift at
*both* ends — it told the agent to call the MCP project-list tool for candidates,
and to put the chosen id on its own issue-create call. The second half was a
wording fix (`--project` on `apply`). The first half was not fixable by wording:
on the API path there is no MCP tool to call, and the whole point of that path is
that the agent makes no Linear calls. So the engine now offers the list, exactly
as `spec-sync states` offers workspace states.

It inherits the picker's "degrade, never block" contract rather than the usual
fail-loudly one: **every** failure — no key, MCP transport, a Linear that will not
answer — exits 0 with a reason and a `null` list. `null` rather than `[]` on
purpose: an empty array would read as "this team has no projects", which is a
different thing from "could not ask".

**The adoption caveat dissolved.** The old fragment said to skip `record` for a
spec that adopted an existing issue, because recording without pushing would
claim in-sync while Linear still held the reporter's text. `apply` pushes *and*
records, so the two cannot disagree — the note now just states what applying an
adopted spec does (replaces the reporter's description, which is the one-way rule)
instead of carving out a step.
